# shopify-codemod

This repository contains a collection of Codemods written with [JSCodeshift](https://github.com/facebook/jscodeshift) that will help update our old, crusty JavaScript to nice, clean JavaScript.

## Usage

1. `npm install -g jscodeshift`
1. `git clone https://github.com/shopify/javascript` or [download the zip file](https://github.com/shopify/javascript/archive/master.zip)
1. `jscodeshift -t <codemod-script> <file>`
1. Use the `-d` option for a dry-run and use `-p` to print the output for comparison.

## Included Transforms

### `coffeescript-range-output-to-helper`

Changes the output of CoffeeScript’s range operator (`[foo...bar]`) into a reference to Shopify’s global range helper. Because this creates a global, you should run the `global-reference-to-import` transform after this one.

```sh
jscodeshift -t shopify-codemod/transforms/coffeescript-range-output-to-helper <file>
```

#### Example

```js
// [this.qux..foo.bar.baz()] in CoffeeScript

(function() {
  var ref;
  var results = [];

  for (var i = ref = this.qux, ref1 = foo.bar.baz(); (ref <= ref1 ? i <= ref1 : i >= ref1); (ref <= ref1 ? i++ : i--)) {
      results.push(i);
  }

  return results;
}).apply(this);


// BECOMES:

Shopify.range({
  from: this.qux,
  to: foo.bar.baz(),
  inclusive: true
});

```

### `mocha-context-to-global-reference`

Removes any specified properties that are injected into the mocha test context (that is, that are referenced using `this` in your tests) to appropriate globals instead. This is particularly useful for making any sinon-injected properties reference a global sinon sandbox. Note that you must provide a `testContextToGlobals` option for your transform, with keys that indicate the proper global to reference, referencing an object with a `properties` key that is an array of contextual properties to look for, and an optional `replace` key that indicates that the entire property should be renamed.

```sh
jscodeshift -t shopify-codemod/transforms/mocha-context-to-global-reference <file>
```

#### Example

```js

// WITH OPTIONS:
//
// {
//   testContextToGlobals: {
//     sinon: {
//       properties: ['spy', 'stub'],
//     },
//   },
// }

describe('foo', function() {
  setup(function() {
    this.mySpy = this.spy();
    this.myStub = this.stub(someObj, someProp);
  });
});

// BECOMES:

describe('foo', function() {
  setup(function() {
    this.mySpy = sinon.spy();
    this.myStub = sinon.stub(someObj, someProp);
  });
});

// AND WITH OPTIONS:
//
// {
//   testContextToGlobals: {
//     testClock: {
//       properties: ['clock'],
//       replace: true,
//     },
//   },
// }

describe('bar', function() {
  setup(function() {
    this.clock.setTime(Date.now());
  });
});

// BECOMES:

describe('bar', function() {
  setup(function() {
    testClock.setTime(Date.now());
  });
});
```

### `conditional-assign-to-if-statement`

Changes conditional assignment of default values to if statements (see [`no-unused-expressions`.](http://eslint.org/docs/rules/no-unused-expressions))

```sh
jscodeshift -t shopify-codemod/transforms/conditional-assign-to-if-statement <file>
```

#### Example

```js
foo || (foo = 'bar');

// BECOMES:

if (!foo) {
  foo = 'bar';
}
```

### `constant-function-expression-to-statement`

Changes constant function expression declarations to a statement.

```sh
jscodeshift -t shopify-codemod/transforms/constant-function-expression-to-statement <file>
```

#### Example

```js
const a = function() {
  return 1;
};

// BECOMES:

function a() {
  return 1;
}
```

### `function-to-arrow`

Changes function expressions to arrow functions, where possible.

```sh
jscodeshift -t shopify-codemod/transforms/function-to-arrow <file>
```

#### Example

```js
a(function() {
  b(function() { return 1; });
});

// BECOMES:

a(() => {
  b(() => 1);
});
```

### `global-assignment-to-default-export`

Use magic to automatically transform global variable references into import statements.

This transform is meant to be used in conjuction with [sprockets-commoner](https://github.com/Shopify/sprockets-commoner) (which is not open source at time of writing). It depends on `appGlobalIdentifiers` being set to an array of strings containing the global namespaces of your application (`App` in this example).

```sh
jscodeshift -t shopify-codemods/transforms/global-assignment-to-default-export <file>
```

#### Example

```js
App.whatever = 1;

// BECOMES:

'expose App.whatever';
export default 1;
```

### `global-reference-to-import`

Use magic to automatically transform global variable references into import statements.

This transform is meant to be used in conjuction with [sprockets-commoner](https://github.com/Shopify/sprockets-commoner) (which is not open source at time of writing). It depends on `appGlobalIdentifiers` being set to an array of strings containing the global namespaces of your application (`App` in this example). It also requires `javascriptSourceLocation` to be set to a folder containing all the source files.

```sh
jscodeshift -t shopify-codemods/transforms/global-reference-to-import <file>
```

#### Example

```js
console.log(App.Components.UIList);

// BECOMES:

import UIList from 'app/components/ui_list';
console.log(UIList);
```

### `mocha-context-to-closure`

Transforms Mocha tests that use `this` to store context shared between tests to use closure variables instead.

```sh
jscodeshift -t shopify-codemod/transforms/mocha-context-to-closure <file>
```

#### Example

```js
describe(function() {
  beforeEach(function() {
    this.subject = {};
  });

  it('is an empty object', function() {
    expect(this.subject).to.deep.equal({});
  });
});

// BECOMES:

describe(() => {
  let subject;
  beforeEach(() => {
    subject = {};
  });

  it('is an empty object', () => {
    expect(subject).to.deep.equal({});
  });
});
```

### `remove-useless-return-from-test`

Changes CoffeeScript-translated test files to remove useless return statements.

```sh
jscodeshift -t shopify-codemod/transforms/remove-useless-return-from-test <file>
```

#### Example

```js
suite('a', () => {
  beforeEach(() => {
    return a();
  });
  afterEach(() => {
    return a();
  });
  before(() => {
    return a();
  });
  after(() => {
    return a();
  });
  setup(() => {
    return a();
  });
  teardown(() => {
  });
  context('bla', function() {
    return it('bla', () => {
      return assert(true);
    });
  });
  return test('a', () => {
    assert(false);
    return assert(true);
  });
});


// BECOMES:

suite('a', () => {
  beforeEach(() => {
    a();
  });
  afterEach(() => {
    a();
  });
  before(() => {
    a();
  });
  after(() => {
    a();
  });
  setup(() => {
    a();
  });
  teardown(() => {
  });
  context('bla', function() {
    it('bla', () => {
      assert(true);
    });
  });

  test('a', () => {
    assert(false);
    assert(true);
  });
});

```


### `ternary-statement-to-if-statement`

Changes ternary statement expressions to if statements.

```sh
jscodeshift -t shopify-codemod/transforms/ternary-statement-to-if-statement <file>
```

#### Example

```js
(1 > 2 ? a() : b());

// BECOMES:

if (1 > 2) {
  a();
} else {
  b();
}
```

```js
function c() {
  return (1 > 2 ? a() : b());
}

// BECOMES:

function c() {
  if (1 > 2) {
    return a();
  } else {
    return b();
  }
}
```

## Contributing

All code is written in ES2015+ in the `transforms/` directory. Make sure to add tests for all new transforms and features. A custom `transforms(fixtureName)` assertion is provided which checks that the passed transformer converts the fixture found at `test/fixtures/{{fixtureName}}.input.js` to the one found at `test/fixtures/{{fixtureName}}.output.js`. You can run `npm test` to run all tests, or `npm run test:watch` to have Mocha watch for changes and re-run the tests.
