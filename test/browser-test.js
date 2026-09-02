/*

   Adapted from: https://github.com/swans-one/browser-test
   Used under the MIT license (see below)

Copyright 2026 Erik Swanson (theerikswanson@gmail.com)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
“Software”), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */

export class Tester {
  constructor(node) {
    this.ctx = {
      node: node, sections: [], tests: [], fixtures: [],
    };
  }

  methods() {
    return {
      assert: this.assert.bind(this),
      describe: this.describe.bind(this),
      expect: this.expect.bind(this),
      expectEqual: this.expectEqual.bind(this),
      expectDeepEqual: this.expectDeepEqual.bind(this),
      expectErr: this.expectErr.bind(this),
      fix: this.fix.bind(this),
    }
  }

  describe(name, fn) {
    let {node, sections, fixtures} = this.ctx;

    const li = document.createElement("li");
    const header = document.createTextNode(name);
    const subsection = document.createElement("ul")
    li.appendChild(header);
    li.appendChild(subsection);
    node.appendChild(li);

    sections.push(async () => {
      this.ctx = {
        node: subsection, sections: [], tests: [], fixtures: [...fixtures],
      }
      return await fn();
    })
  }

  fix(name, setupFn, teardownFn) {
    teardownFn = teardownFn || (() => undefined);

    const {fixtures} = this.ctx;
    fixtures.push([name, setupFn, teardownFn])
  }

  _expectHelper(msg, val, fn, valMap=(v)=>v, catchPass=false) {
    const {node, tests, fixtures} = this.ctx;
    tests.push(async () => {
      let pass;
      let result;
      const fixtureResults = await Tester.doFixtures(fixtures);
      val = valMap(val);
      try {
        result = valMap(await fn(fixtureResults));
        pass = val === result;
      } catch (err) {
        pass = catchPass;
        result = err;
      } finally {
        await Tester.undoFixtures(fixtures, fixtureResults);
      }
      if (pass) { // Shorten output only when passing
        val = JSON.stringify(val === undefined ? "<undefined>" : val);
        val = val.length > 30 ? `${val.slice(0,30)}...` : val;

        result = JSON.stringify(result === undefined ? "<undefined>" : result);
        result = result.length > 30 ? `${result.slice(0,30)}...` : result;
      }
      Tester.displayResult(node, pass, msg, val, result)
    })
  }

  static async doFixtures(fixtures) {
    const out = {};
    for (const [name, setup, ] of fixtures) {
      out[name] = await setup();
    }
    return out;
  }

  static async undoFixtures(fixtures, fixtureResults) {
    for (let [, , teardown] of fixtures.toReversed()) {
      await teardown(fixtureResults);
    }
  }

  static displayResult(node, pass, msg, expected, result) {
    const color = pass ? "darkgreen" : "darkred";
    const html = `
      <div style="color: ${color}">
        "${msg}". Expected: ${expected}. Result: ${result}.
      </div>
    `
    const li = document.createElement("li");
    li.innerHTML = html;
    node.appendChild(li);
  }

  expectEqual(msg, val, fn) {
    this._expectHelper(msg, val, fn);
  }

  expect(msg, fn) {
    this._expectHelper(msg, true, fn);
  }

  expectDeepEqual(msg, val, fn) {
    this._expectHelper(msg, val, fn, JSON.stringify);
  }

  expectErr(msg, fn) {
    this._expectHelper(msg, "[Error]", fn, undefined, true);
  }

  assert(val, msg) {
    if (!val) { throw new Error(`Assert Fail: ${msg}`)}
  }

  run() {
    let {sections, tests} = this.ctx;
    this._runHelper(sections, tests, []).then((allTests) => {
      Promise.all(allTests.map(fn => fn()));
    });
  }

  async _runHelper(sectionFns, tests, allTests) {
    allTests.push(...tests);

    for (const section of sectionFns) {
      await section()
      let {sections, tests} = this.ctx;
      allTests = await this._runHelper(sections, tests, allTests)
    }
    return allTests
  }
}
