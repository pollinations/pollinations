migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // remove field
  collection.fields.removeById("relation2959328914")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // add field
  collection.fields.addAt(2, new Field({
    "cascadeDelete": false,
    "collectionId": "_pb_users_auth_",
    "help": "",
    "hidden": false,
    "id": "relation2959328914",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "first_discoverer",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
