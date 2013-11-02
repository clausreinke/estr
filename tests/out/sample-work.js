function log_it(x) { }
var z;
function A() {
  var x;
  var y = [x,function(x) {
                log_it(z.a);
                function A() {
                  log_it(z.b);
                  var x;
                  var z;
                  return x;
                }
                return A(x);
              }];
  var z = [function(x) { return (function(x) { return x; }(function(x) { return x; }))(x); },x];

  try {
    throw "hi";
  } catch (e) {
    var e = "ho"; // double scope binding, initialization!=declaration:-(
    log_it(e);
  }
  log_it(e);

  try {
    throw "hi";
  } catch (f) {
    function f(){log_it(f)}  // yet another scope border case, non-standard
    log_it(f);
  }
  log_it(f);
  return x;
}
A();
function outer(x,y) { return function(a,b) {
  return [x,y,a,b];
}}
exports.none = null;
try {
  throw "hi";
} catch (f) {
  var ff = "hu";
  log_it(f);
}
log_it(ff);
function require(dependency) {
  return require.cache[dependency].dependency // computed vs non-computed properties
}
function Class() {}
Class.prototype.method = function() {
  log_it('doit');
};
var obj = { "method_f" : function() {}
          , "method_g" : function() {}
          };
obj.method_h = function() {};
