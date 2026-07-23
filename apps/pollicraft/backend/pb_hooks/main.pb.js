
// PocketBase serializes every route/hook handler into an isolated program.
// Keep this file as registration-only and require shared code inside handlers.

onRecordValidate(function(e) {
  return require(__hooks + "/pollicraft.js").validateElement(e);
}, "elements");

routerAdd("POST", "/craft", function(e) {
  return require(__hooks + "/pollicraft.js").craft(e);
});

routerAdd("POST", "/inventory", function(e) {
  return require(__hooks + "/pollicraft.js").inventory(e);
});
