/* ==========================================================================
   ophis.expr.js — the operation language: normalise, parse, compile, evaluate
   --------------------------------------------------------------------------
   An "operation" is a one-line formula that turns an interval Y (whole days
   between two X-Dates) into a day-offset, anchored on X1 or X2:

       X2 + oph_flip(oph_round(Y))
       X1 + (Y/2.0)xOPH_PI

   SECURITY NOTE — this is the one place this rewrite deliberately does NOT
   copy the desktop app. Ophis v12 compiles the formula body with
   `new Function("Y", "return " + body)` (src/ophis_model__validation.js:158),
   which makes any .oph file a script: the string is validated in a *stripped*
   form and then a *different* string is compiled. That is finding #1 of the
   reverse-engineering report.

   Here the formula is tokenised and parsed into an AST that can only express
   the grammar below, then walked. There is no eval, no new Function, no way to
   name anything the grammar does not define — so a hostile .oph is a syntax
   error, not code.

       expr   := term (('+'|'-') term)*
       term   := factor (('*'|'/') factor)*
       factor := number | 'Y' | CONST | func '(' expr ')' | '(' expr ')' | '-' factor

   Arithmetic results are identical to the compiled version on every legal
   formula — web/tests/ proves it operation by operation.
   ========================================================================== */
(function (root) {
  "use strict";

  var C = root.Ophis.C;
  var E = {};

  /* ---------------------------------------------------------------- funcs */
  /* Ported from src/ophis_utils.js. Keep the semantics exactly: oph_sqrt does
     NOT take an absolute value first, so sqrt of a negative yields NaN and the
     operation is rejected at validation time — same as the desktop app. */

  function oph_flip(value) {
    // Digit reversal preserving the position of the decimal point:
    //   1319   -> 9131
    //   13.19  -> 91.31
    // Verbatim port, including its behaviour on negatives (the '-' travels to
    // the end and the result is NaN, which validation then rejects).
    var s = value + "";
    var dot = s.indexOf(".");
    s = s.replace(".", "");
    var parts = s.split("").reverse();
    if (dot > 0) parts.splice(dot, 0, ".");
    return Number(parts.join("")).valueOf();
  }

  E.FUNCS = {
    oph_sqrt: function (v) { return Math.sqrt(v); },
    oph_abs: function (v) { return Math.abs(v); },
    oph_floor: function (v) { return Math.floor(v); },
    oph_ceil: function (v) { return Math.ceil(v); },
    oph_log: function (v) { return Math.log(v); },
    oph_sin: function (v) { return Math.sin(v); },
    oph_cos: function (v) { return Math.cos(v); },
    oph_tan: function (v) { return Math.tan(v); },
    oph_round: function (v) { return Math.round(v); },
    oph_flip: oph_flip,
    oph_exp: function (v) { return Math.exp(v); }
  };
  E.FUNC_NAMES = Object.keys(E.FUNCS);
  E.oph_flip = oph_flip;

  /* ------------------------------------------------------------ normalise */
  /* Port of normalizeOperationEquationString(). The function names are folded
     to upper case first so that the "x means multiply" pass cannot eat the x
     inside `oph_exp`; they are folded back afterwards. */
  E.normalize = function (equation, doReplacements) {
    if (equation === null || equation === undefined || equation === "") return "";
    if (doReplacements === undefined) doReplacements = true;

    var s = ("" + equation).split(" ").join("");

    E.FUNC_NAMES.forEach(function (name) {
      s = s.split(name).join(name.toUpperCase());
    });

    if (doReplacements) {
      s = s.split("x").join("*");
      C.ALL_OPH_CONSTANTS.forEach(function (name) {
        s = s.split(name).join("" + C.CONSTANT_VALUES[name]);
      });
    }

    E.FUNC_NAMES.forEach(function (name) {
      s = s.split(name.toUpperCase()).join(name);
    });

    return s;
  };

  /* Which X-Date the offset is added to. Port of getStartingX(). */
  E.startingX = function (equation, needsNormalizing) {
    var s = (needsNormalizing === false) ? equation : E.normalize(equation);
    if (s.indexOf("X1+") === 0) return C.STARTING_X1;
    if (s.indexOf("X2+") === 0) return C.STARTING_X2;
    return null;
  };

  /* ------------------------------------------------------------ tokeniser */
  function tokenize(src) {
    var toks = [];
    var i = 0;
    function isDigit(c) { return c >= "0" && c <= "9"; }
    function isAlpha(c) { return /[A-Za-z_]/.test(c); }

    while (i < src.length) {
      var c = src[i];
      if (c === " " || c === "\t") { i++; continue; }
      if ("+-*/()".indexOf(c) >= 0) { toks.push({ t: c }); i++; continue; }
      if (isDigit(c) || c === ".") {
        // A dot straight after a name is member access — the commonest shape an
        // injection attempt takes, so it gets its own message.
        if (c === "." && toks.length && toks[toks.length - 1].t === "id") {
          throw new Error("'.' is not part of the formula language (no member access)");
        }
        var j = i;
        while (j < src.length && (isDigit(src[j]) || src[j] === ".")) j++;
        var raw = src.slice(i, j);
        var num = parseFloat(raw);
        if (isNaN(num) || raw.split(".").length > 2) throw new Error("not a number: '" + raw + "'");
        toks.push({ t: "num", v: num });
        i = j;
        continue;
      }
      if (isAlpha(c)) {
        var k = i;
        while (k < src.length && (isAlpha(src[k]) || isDigit(src[k]))) k++;
        toks.push({ t: "id", v: src.slice(i, k) });
        i = k;
        continue;
      }
      var NAMED = { ";": "a second statement", ",": "an argument list", "[": "indexing", "]": "indexing",
                    "{": "a block", "}": "a block", "=": "assignment", "`": "a template string",
                    "'": "a string", "\"": "a string", "&": "a bitwise operator", "|": "a bitwise operator",
                    "!": "negation", "?": "a conditional", ":": "a conditional", "%": "the remainder operator",
                    "^": "the caret operator", "<": "a comparison", ">": "a comparison", "\\": "an escape" };
      throw new Error(NAMED[c]
        ? "'" + c + "' (" + NAMED[c] + ") is not part of the formula language"
        : "'" + c + "' is not part of the formula language");
    }
    return toks;
  }

  /* --------------------------------------------------------------- parser */
  function parse(src) {
    var toks = tokenize(src);
    var p = 0;

    function peek() { return toks[p]; }
    function eat(t) {
      if (!toks[p] || toks[p].t !== t) throw new Error("expected '" + t + "'");
      return toks[p++];
    }

    function parseExpr() {
      var n = parseTerm();
      while (peek() && (peek().t === "+" || peek().t === "-")) {
        var op = toks[p++].t;
        n = { op: op, l: n, r: parseTerm() };
      }
      return n;
    }
    function parseTerm() {
      var n = parseFactor();
      while (peek() && (peek().t === "*" || peek().t === "/")) {
        var op = toks[p++].t;
        n = { op: op, l: n, r: parseFactor() };
      }
      return n;
    }
    function parseFactor() {
      var tk = peek();
      if (!tk) throw new Error("unexpected end of expression");
      if (tk.t === "-") { p++; return { op: "neg", x: parseFactor() }; }
      if (tk.t === "+") { p++; return parseFactor(); }
      if (tk.t === "num") { p++; return { op: "num", v: tk.v }; }
      if (tk.t === "(") { p++; var e = parseExpr(); eat(")"); return e; }
      if (tk.t === "id") {
        p++;
        if (tk.v === "Y") return { op: "var" };
        if (Object.prototype.hasOwnProperty.call(C.CONSTANT_VALUES, tk.v)) {
          return { op: "num", v: C.CONSTANT_VALUES[tk.v] };
        }
        if (Object.prototype.hasOwnProperty.call(E.FUNCS, tk.v)) {
          eat("(");
          var arg = parseExpr();
          eat(")");
          return { op: "call", fn: tk.v, arg: arg };
        }
        // Every injection attempt ends here: identifiers the grammar does not
        // define (window, globalThis, constructor, require, ...) are rejected.
        throw new Error("unknown name: '" + tk.v + "'");
      }
      throw new Error("unexpected token '" + tk.t + "'");
    }

    var ast = parseExpr();
    if (p !== toks.length) throw new Error("trailing input after a complete expression");
    return ast;
  }

  /* ------------------------------------------------------------ evaluator */
  function evaluate(node, Y) {
    switch (node.op) {
      case "num": return node.v;
      case "var": return Y;
      case "neg": return -evaluate(node.x, Y);
      case "+": return evaluate(node.l, Y) + evaluate(node.r, Y);
      case "-": return evaluate(node.l, Y) - evaluate(node.r, Y);
      case "*": return evaluate(node.l, Y) * evaluate(node.r, Y);
      case "/": return evaluate(node.l, Y) / evaluate(node.r, Y);
      case "call": return E.FUNCS[node.fn](evaluate(node.arg, Y));
    }
    throw new Error("unknown node");   // unreachable by construction
  }

  /* A Z-Value has to be a real, positive number — port of
     isValidOperationEquationResult(). */
  E.isValidResult = function (result) {
    return typeof result === "number" && !isNaN(result) && isFinite(result) && result > 0;
  };

  E.Z_VALUE_MUST_BE_POSITIVE = "Z-Value must resolve to a number greater than 0.";

  /**
   * Compile one operation string.
   * @returns {{ok:boolean, errors:string[], anchor:string|null, body:string,
   *            normalized:string, run:function(number):number}}
   */
  E.compile = function (equation) {
    var out = {
      ok: false, errors: [], anchor: null, body: "", normalized: "",
      run: function (Y) { return Y; }        // DEFAULT_OPERATION_FUNCTION
    };

    if (equation === null || equation === undefined || ("" + equation).trim() === "") {
      out.errors.push("Cannot be empty.");
      return out;
    }

    var normalized = E.normalize(equation, true);
    out.normalized = normalized;

    var anchor = E.startingX(normalized, false);
    if (anchor !== C.STARTING_X1 && anchor !== C.STARTING_X2) {
      out.errors.push("Must start with 'X1 + …' or 'X2 + …'");
      return out;
    }
    out.anchor = anchor;

    var body = normalized.slice(3);           // drop the "X1+" / "X2+"
    out.body = body;

    if (body.indexOf("=") >= 0) {
      out.errors.push("Cannot include '=' in the equation.");
      return out;
    }

    var ast;
    try {
      ast = parse(body);
    } catch (err) {
      out.errors.push(err.message);
      return out;
    }

    // Same smoke test the desktop app runs: evaluate at Y = 10 and demand a
    // positive number.
    var probe;
    try {
      probe = evaluate(ast, C.SAMPLE_Y_VALUE_FOR_VALIDATION);
    } catch (err) {
      out.errors.push("" + err.message);
      return out;
    }
    if (!E.isValidResult(probe)) {
      out.errors.push(E.Z_VALUE_MUST_BE_POSITIVE);
      return out;
    }

    out.ok = true;
    out.run = function (Y) { return evaluate(ast, Y); };
    return out;
  };

  /**
   * Validate one operation in the context of the whole list (adds the
   * uniqueness rule the desktop app applies: an operation may not repeat an
   * earlier one once normalised).
   */
  E.validateInList = function (equation, indexInList, operations) {
    var result = E.compile(equation);
    if (!result.ok) return result;

    var normalized = result.normalized;
    for (var i = indexInList - 1; i >= 0; i--) {
      if (!operations[i]) continue;
      if (E.normalize(operations[i].equation, true) === normalized) {
        result.ok = false;
        result.errors.push("Identical to Operation " + (i + 1) + "; each Operation must be unique.");
        return result;
      }
    }
    return result;
  };

  /* Pretty form for the UI: normalised but with the constants left as names
     and 'x' left as 'x', i.e. what the operator typed, tidied. */
  E.display = function (equation) {
    return E.normalize(equation, false);
  };

  root.Ophis.Expr = E;
})(typeof window !== "undefined" ? window : globalThis);
