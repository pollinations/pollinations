migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // update field
  collection.fields.addAt(4, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1482891838",
    "help": "",
    "hidden": false,
    "id": "relation2361424699",
    "maxSelect": 2,
    "minSelect": 2,
    "name": "ingridients",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1482891838")

  // update field
  collection.fields.addAt(4, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1482891838",
    "help": "",
    "hidden": false,
    "id": "relation2361424699",
    "maxSelect": 2,
    "minSelect": 0,
    "name": "ingridients",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
