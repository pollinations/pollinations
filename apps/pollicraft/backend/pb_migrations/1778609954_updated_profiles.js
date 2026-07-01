migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3414089001")

  // update field
  collection.fields.addAt(1, new Field({
    "exceptDomains": null,
    "help": "",
    "hidden": true,
    "id": "email3885137012",
    "name": "email",
    "onlyDomains": null,
    "presentable": false,
    "required": true,
    "system": false,
    "type": "email"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3414089001")

  // update field
  collection.fields.addAt(1, new Field({
    "exceptDomains": null,
    "help": "",
    "hidden": false,
    "id": "email3885137012",
    "name": "email",
    "onlyDomains": null,
    "presentable": false,
    "required": true,
    "system": false,
    "type": "email"
  }))

  return app.save(collection)
})
