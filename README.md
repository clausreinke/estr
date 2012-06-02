
This is an in-browser demo of [estr](https://github.com/clausreinke/estr). 

ESTR - ECMAScript traversals
============================

Commandline tool for working with Javascript code, using nodejs and esprima.

Currently supports:

- generating scope-aware tags from [esprima](http://esprima.org/) ASTs, for use with the [scoped_tags Vim mode](https://github.com/clausreinke/scoped_tags)

- renaming a variable (WARNING: this is work in progress and still needs testing; to emphasize this, it will currently output the modified file to stdout instead of replacing the file)

Usage
-----

```
node estr.js tags ..paths
   traverse paths, extract tags from .js-files, write to file "tags"

node estr.js rename file.js oldName <line> <column> newName
   parse file.js, rename oldName (at <line> <column>) to newName

```

Assumptions
-----------

- `esprima.js` to be in the same directory as the `estr` modules

- in rename, <line> <column> point to the beginning of an oldName occurrence;
  all oldName occurrences in the same scope will be renamed, provided that

  - oldName/newName are valid Identifiers
  - a binding for oldName is available
  - no existing binding for newName in the same scope
  - no existing occurrences of newName will be captured by renamed binding
  - no renamed occurrences of oldName will be captured by existing binding
  - renaming is not affected by same-name hoisting over catch (language edge case)

