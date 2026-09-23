/* NATORION · engine/expr.js
   The equation language, parsed rather than eval'd.

   Ophis v12 compiled every operation string with new Function(), after
   checking a *different*, stripped copy of it with math.js. A crafted .oph
   could therefore run code. Here one parser both validates and evaluates, and
   it knows only: numbers, Y, the four OPH_ constants, the oph_* functions,
   + - * / % ^, unary signs and brackets. Anything else is a parse error.

   Two deliberate differences from the original, both bug fixes:
     ^  means power (math.js validated it as power; JavaScript then ran it as XOR).
     Unknown names are rejected up front instead of failing at run time. */
(function (root) {
  "use strict";
  var NC = root.NC || (root.NC = {});
  var C = NC.C;
  function isFunc(name) { return Object.prototype.hasOwnProperty.call(NC.FUNCS, name); }

  /* Mirror of normalizeOperationEquationString(): drop spaces, read the
     lower-case x as multiply, substitute constant values. Function names are
     protected first because "oph_exp" contains an x. The normalised string is
     also what makes two operations "identical". */
  function normalize(text) {
    if (text === null || text === undefined || text === "") return "";
    var s = String(text).split(" ").join("");
    C.FUNCTION_NAMES.forEach(function (n) { s = s.split(n).join(n.toUpperCase()); });
    s = s.split("x").join("*");
    C.CONSTANT_NAMES.forEach(function (n) { s = s.split(n).join(String(C[n])); });
    C.FUNCTION_NAMES.forEach(function (n) { s = s.split(n.toUpperCase()).join(n); });
    return s;
  }

  function startingX(normalized) {
    if (normalized.indexOf("X1+") === 0) return 1;
    if (normalized.indexOf("X2+") === 0) return 2;
    return 0;
  }

  /* ------------------------------------------------------------ tokens -- */
  function tokenize(src) {
    var out = [], i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        var m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
        if (!m) throw new Error("'" + ch + "' at position " + (i + 1) + " is not part of a number.");
        out.push({ t: "num", v: parseFloat(m[0]), p: i }); i += m[0].length; continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        var w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
        if (w !== "Y" && !isFunc(w)) {
          if (/^X\d$/.test(w)) throw new Error("X1/X2 may appear only at the start, as 'X1+' or 'X2+'.");
          throw new Error("Unknown name '" + w + "'. Allowed: Y, OPH_PI, OPH_PHI, OPH_CRV, OPH_HEP and the oph_ functions.");
        }
        out.push({ t: "id", v: w, p: i }); i += w.length; continue;
      }
      if ("+-*/%^(),".indexOf(ch) >= 0) { out.push({ t: ch, p: i }); i++; continue; }
      throw new Error("'" + ch + "' is not allowed in an equation.");
    }
    out.push({ t: "end", p: src.length });
    return out;
  }

  /* ------------------------------------------------------------ parser --
     expr   := term (("+"|"-") term)*
     term   := unary (("*"|"/"|"%") unary)*
     unary  := ("+"|"-") unary | power
     power  := atom ("^" unary)?
     atom   := number | Y | name "(" expr ")" | "(" expr ")"            */
  function parse(src) {
    var toks = tokenize(src), k = 0;
    function peek() { return toks[k]; }
    function eat(t) {
      if (toks[k].t !== t) throw new Error("Expected '" + t + "' at position " + (toks[k].p + 1) + ".");
      return toks[k++];
    }
    function expr() {
      var n = term();
      while (peek().t === "+" || peek().t === "-") { var o = toks[k++].t; n = { op: o, a: n, b: term() }; }
      return n;
    }
    function term() {
      var n = unary();
      while (peek().t === "*" || peek().t === "/" || peek().t === "%") { var o = toks[k++].t; n = { op: o, a: n, b: unary() }; }
      return n;
    }
    function unary() {
      if (peek().t === "-") { k++; return { op: "neg", a: unary() }; }
      if (peek().t === "+") { k++; return unary(); }
      return power();
    }
    function power() {
      var n = atom();
      if (peek().t === "^") { k++; n = { op: "^", a: n, b: unary() }; }
      return n;
    }
    function atom() {
      var t = peek();
      if (t.t === "num") { k++; return { op: "num", v: t.v }; }
      if (t.t === "(") { k++; var n = expr(); eat(")"); return n; }
      if (t.t === "id") {
        k++;
        if (t.v === "Y") return { op: "Y" };
        if (isFunc(t.v)) { eat("("); var arg = expr(); eat(")"); return { op: "fn", name: t.v, a: arg }; }
        if (/^X\d$/.test(t.v)) throw new Error("X1/X2 may appear only at the start, as 'X1+' or 'X2+'.");
        throw new Error("Unknown name '" + t.v + "'. Allowed: Y, OPH_PI, OPH_PHI, OPH_CRV, OPH_HEP and the oph_ functions.");
      }
      if (t.t === "end") throw new Error("The equation ends too early.");
      throw new Error("Unexpected '" + t.t + "' at position " + (t.p + 1) + ".");
    }
    var tree = expr();
    if (peek().t !== "end") throw new Error("Unexpected '" + (peek().v || peek().t) + "' at position " + (peek().p + 1) + ".");
    return tree;
  }

  /* stripFunctions evaluates every oph_* call as its bare argument, which is
     exactly what the original's math.js pre-check saw. */
  function evaluate(node, Y, stripFunctions) {
    switch (node.op) {
      case "num": return node.v;
      case "Y": return Y;
      case "neg": return -evaluate(node.a, Y, stripFunctions);
      case "fn": var v = evaluate(node.a, Y, stripFunctions); return stripFunctions ? v : NC.FUNCS[node.name](v);
      case "+": return evaluate(node.a, Y, stripFunctions) + evaluate(node.b, Y, stripFunctions);
      case "-": return evaluate(node.a, Y, stripFunctions) - evaluate(node.b, Y, stripFunctions);
      case "*": return evaluate(node.a, Y, stripFunctions) * evaluate(node.b, Y, stripFunctions);
      case "/": return evaluate(node.a, Y, stripFunctions) / evaluate(node.b, Y, stripFunctions);
      case "%": return evaluate(node.a, Y, stripFunctions) % evaluate(node.b, Y, stripFunctions);
      case "^": return Math.pow(evaluate(node.a, Y, stripFunctions), evaluate(node.b, Y, stripFunctions));
    }
    throw new Error("Bad node " + node.op);
  }

  function isGoodZ(v) { return typeof v === "number" && !Number.isNaN(v) && v > 0; }

  /* Validate one operation against the ones before it. Returns
     { fn, startingX, normalized, errors }. fn is null when there are errors. */
  function compileOperation(equation, index, operations) {
    var errors = [], result = { fn: null, startingX: 0, normalized: "", errors: errors };
    if (equation === null || equation === undefined || String(equation).trim() === "") { errors.push("Cannot be empty."); return result; }
    var norm = normalize(equation);
    result.normalized = norm;
    var sx = startingX(norm);
    result.startingX = sx;
    if (!sx) { errors.push("Must start with 'X1 + …' or 'X2 + …'."); return result; }
    if (norm.indexOf("=") >= 0) { errors.push("Cannot include '=' in the equation."); return result; }
    var tree;
    try { tree = parse(norm.slice(3)); } catch (e) { errors.push(e.message); return result; }
    try {
      if (!isGoodZ(evaluate(tree, C.SAMPLE_Y, true)) || !isGoodZ(evaluate(tree, C.SAMPLE_Y, false))) {
        errors.push("Z-value must resolve to a number > 0.");
        return result;
      }
    } catch (e) { errors.push(e.message); return result; }
    for (var i = index - 1; i >= 0; i--) {
      if (operations && operations[i] && normalize(operations[i].equation) === norm) {
        errors.push("Identical to Operation " + (i + 1) + "; each Operation must be unique.");
        return result;
      }
    }
    result.fn = function (Y) { return evaluate(tree, Y, false); };
    return result;
  }

  NC.expr = { normalize: normalize, parse: parse, evaluate: evaluate, compileOperation: compileOperation, startingX: startingX };
})(typeof window !== "undefined" ? window : globalThis);
