
ESTR - ECMAScript traversals
============================

Commandline tool for working with Javascript code, using nodejs and esprima.

Currently supports:

- generating scope-aware tags from [esprima](http://esprima.org/)'s AST, for use with the [scoped_tags Vim mode](https://github.com/clausreinke/scoped_tags)

Usage
-----

```
node estr.js tags ..jsfiles..
```

will generate sorted `tags` file for the `.js` files given as arguments (currently assumes `esprima.js` to be in the same directory as `estr.js`; directory arguments will be traversed, non-.js-file ignored).
