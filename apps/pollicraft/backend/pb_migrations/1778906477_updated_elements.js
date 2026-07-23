migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_mfyzab3v8a` ON `elements` (`name`)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_mfyzab3v8a` ON `elements` (`name`)",
      "CREATE UNIQUE INDEX `idx_yty1pv89jj` ON `elements` (`ingridients`)"
    ]
  }, collection)

  return app.save(collection)
})
