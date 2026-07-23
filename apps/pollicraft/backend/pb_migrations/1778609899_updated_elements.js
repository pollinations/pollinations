migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // add field
  collection.fields.addAt(5, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3414089001",
    "help": "",
    "hidden": false,
    "id": "relation570140565",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "discoverer",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // remove field
  collection.fields.removeById("relation570140565")

  return app.save(collection)
})
