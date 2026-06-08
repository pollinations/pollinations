migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_mfyzab3v8a` ON `elements_` (`name`)",
      "CREATE UNIQUE INDEX `idx_yty1pv89jj` ON `elements_` (`ingridients`)"
    ]
  }, collection)

  // add field
  collection.fields.addAt(5, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1482891838",
    "help": "",
    "hidden": false,
    "id": "relation2361424699",
    "maxSelect": 2,
    "minSelect": 2,
    "name": "ingridients",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_mfyzab3v8a` ON `elements_` (`name`)"
    ]
  }, collection)

  // remove field
  collection.fields.removeById("relation2361424699")

  return app.save(collection)
})
