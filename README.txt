
INSTRUCTIONS
============

- Open ophis.html in any web browser, preferably on an air-gapped machine (not connected to the Internet). Also preferably using a privacy-friendly browser like https://brave.com/. Mullvad (https://mullvad.net/en/browser) WOULD BE a better option except it reduces window size to prevent finger-printing attacks, which aren't relevant to Ophis security and limit the visible output area.

- See the "About" screen inside the application for further information.



PROJECT STRUCTURE
=================
- "/lib" folder contains 3rd party open source Javascript libraries (dependencies) that are much too time-consuming to write from scratch. These libraries are well-audited and should never reach out to the Internet themselves.
- "/src" contains all the Ophis custom code.
- "/img" you get the idea...