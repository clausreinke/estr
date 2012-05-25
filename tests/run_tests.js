// TODO: - too many subprocesses: slow on windows/mingw
//       - support in-browser tests

var fs            = require('fs');
var child_process = require('child_process');

var exec         = child_process.exec;

var output_dir   = process.argv.indexOf('--record')>-1 ? 'out/' : 'tmp/';

var test_pattern = process.argv.indexOf('--match');

var tests = {started: 0
            ,done:    0
            ,checked: 0
            ,ok:      0
            ,ko:      0
            };

function test(name,cmd,files) {

  if ((test_pattern>-1) && !name.match(process.argv[test_pattern+1]))
    return;

  exec(cmd,function(error,stdout,stderr) {

    console.log(name+' done'); tests.done++;

    fs.writeFileSync(output_dir+name+'.error',error);
    fs.writeFileSync(output_dir+name+'.stdout',stdout);
    fs.writeFileSync(output_dir+name+'.stderr',stderr);

    if (files) {
      exec('mv '+files.join(' ')+' '+output_dir,function(error){
        if (error) throw error;
        diff([name+'.error',name+'.stdout',name+'.stderr'].concat(files),['//']);
      });
    } else {
      diff([name+'.error',name+'.stdout',name+'.stderr'],['//']);
    }

  });
  tests.started++;

}

function diff(files,output) {

  if (files.length>0) {

    var file = files.shift();

    exec('diff tmp/'+file+' out/'+file,function(error,stdout,stderr) {
      if (error) {
        tests.ko++;
        output.push('// '+file+' different');
        output.push(stderr);
        output.push(stdout);
      } else {
        tests.ok++;
        output.push('// '+file+' ok');
      }
      diff(files,output);
    });

  } else {
    console.log(output.join('\n'));
    tests.checked++;
    if (tests.checked===tests.started)
      console.log(tests);
  }

}

// should succeed
test('help','node ../estr.js help');

test('tags','node ../estr.js tags sample.js',['tags']);

// should fail
test('rename-invalid-oldName','node ../estr.js rename sample.js old-name 0 0 newName');
test('rename-invalid-newName','node ../estr.js rename sample.js oldName 0 0 new-name');

test('rename-wrong-position','node ../estr.js rename sample.js b 35 38 b');

test('rename-capture-renamed-occurrences','node ../estr.js rename sample.js x 35 15 a');
test('rename-capture-existing-occurrences','node ../estr.js rename sample.js a 35 38 x');
test('rename-conflicting-binders','node ../estr.js rename sample.js a 35 38 b');
test('rename-global-no-binder','node ../estr.js rename sample.js exports 38 0 x_____x');

test('rename-var-in-catch','node ../estr.js rename sample.js e 21 8 x_____x');
test('rename-function-in-catch-1','node ../estr.js rename sample.js f 31 6 x_____x');
test('rename-function-in-catch-2','node ../estr.js rename sample.js f 28 21 x_____x');
test('rename-function-in-catch-3','node ../estr.js rename sample.js f 27 11 x_____x');
// fix this!
test('rename-introduce-catch-hoist-conflict','node ../estr.js rename sample.js ff 45 4 f');

// should succeed
test('rename-success','node ../estr.js rename sample.js z 6 20 x_____x');
