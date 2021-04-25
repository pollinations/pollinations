

// const PeerId = require('peer-id')
const ipns = require('ipns')
const delay = require('delay')
const {writeFileSync} = require("fs")

const uint8ArrayToString = require('uint8arrays/to-string')
const uint8ArrayFromString = require('uint8arrays/from-string')
const IPFS = require("ipfs");

const namespace = '/record/'
const ipfsRef = '/ipfs/QmPFVLPmp9zv5Z5KUqLhe2EivAGccQW2r7M7jhVJGLZoZU'
const ipnsaddr = "/ipns/QmRF3o3uZn9Su5CvHrScvJK8M53twgLSULvD9hYX7QGjSr";


/** @typedef { import("ipfsd-ctl/src/factory") } Factory */
/**
 * @param {Factory} factory
 * @param {Object} options
 */



    // before(async function () {
    //   this.timeout(120 * 1000)

    //   nodes = await Promise.all([
    //     factory.spawn({ ...daemonsOptions }),
    //     factory.spawn({ ...daemonsOptions })
    //   ])

    //   nodeA = nodes[0].api
    //   nodeB = nodes[1].api

    //   const ids = await Promise.all([
    //     nodeA.id(),
    //     nodeB.id()
    //   ])

    //   idA = ids[0]
    //   idB = ids[1]

    //   await nodeA.swarm.connect(idB.addresses[0])
    // })

    // after(() => factory.clean())

    // it('should publish and then resolve correctly', async function () {
    //   this.timeout(80 * 1000)

    //   let subscribed = false

    //   function checkMessage (msg) {
    //     subscribed = true
    //   }

    //   const alreadySubscribed = () => {
    //     return subscribed === true
    //   }

    //   const keys = ipns.getIdKeys(uint8ArrayFromString(idA.id, 'base58btc'))
    //   const topic = `${namespace}${uint8ArrayToString(keys.routingKey.uint8Array(), 'base64url')}`

    //   await expect(last(nodeB.name.resolve(idA.id)))
    //     .to.eventually.be.rejected()
    //     .with.property('message').that.matches(/not found/)

    //   await waitFor(async () => {
    //     const res = await nodeA.pubsub.peers(topic)
    //     return res && res.length
    //   }, { name: `node A to subscribe to ${topic}` })
    //   await nodeB.pubsub.subscribe(topic, checkMessage)
    //   await nodeA.name.publish(ipfsRef, { resolve: false })
    //   await waitFor(alreadySubscribed)
    //   await delay(1000) // guarantee record is written

    //   const res = await last(nodeB.name.resolve(idA.id))

    //   expect(res).to.equal(ipfsRef)
    // })

    const Client = require('ipfs-http-client');
    
    (async function () {
        const node2IP = "18.157.173.110"
        const node2 = Client(`http://${node2IP}:5002`);
        
        // const node1 = Client("http://127.0.0.1:5002");
        const {id:node2ID} = await node2.id()
        // await node1.swarm.connect(`/ip4/${node2IP}/tcp/4002/p2p/${node2ID}`)
        // await node1.pubsub.subscribe("bla",(...args) => console.log("sub",...args))
        // await node2.pubsub.publish("bla","blubb")
        // await node2.pubsub.publish("bla","blub22222b")
        // await node2.pubsub.publish("bla","blu2asdasdbb")
        // await node2.pubsub.subscribe(`${namespace}L2lwbnMvEiArI62x5pbmlazJFhNlOMZA3Y5MRrE_mZIFhYTFH4uFSw`, (...args) => console.log("subns",...args))
        // const {cid} = await node1.add("blalba"+new Date().getTime())
        // const {name} = await node1.name.publish(cid)
        const ipnsHash = "QmVGxPaKaMQGNkSZzjepjbK43UARa3NpCaYwZubSzPXvT8";
        const publishedPath = "/ipns/"+name;
        for await (let resolved of node2.name.resolve(ipnsHash,{recursive:true})) {
            console.log("resolved",resolved)
        };
        return;
        console.log("ipns", publishedPath)
        console.log("pubsub state", await node2.name.pubsub.state(), "subs", await node2.name.pubsub.subs())
        console.log("pubsub ls",await node2.pubsub.ls(), await node1.pubsub.ls())
        const subs = await node2.pubsub.ls();
        subs.forEach(topic => node2.pubsub.subscribe(topic, async ({from,data}) => {
            for await (let resolved of node2.name.resolve(name)) {
                const contents = await node2.get(resolved);
                const recursiveLog =  async (v) => {
                  // console.log(v)
                  if (v.content) {
                    for await (let content of v.content) {
                      // console.log(content)
                      await recursiveLog(content);
                    }
                  }
                  else
                    console.log(v.toString())
                }
                recursiveLog({content:contents})
                // for await (let content of contents) {
                //   console.log("resolved update",content);
                  
                 
                //   //   for await (let c3 of c2.content)
                //   //     console.log("resolved content",c3)
                // }
            };
        }
            ));
        return
        
        // connect to a different API
        const client = create('http://127.0.0.1:5002')
        console.log(client)

        return;
        const node = await IPFS.create({EXPERIMENTAL:{ipnsPubsub: true}})

        const data = 'Hello, Thomas'
        
        // add your data to to IPFS - this can be a string, a Buffer,
        // a stream of Buffers, etc
        const addEntry = await node.add(data)
        console.log("addEntry",addEntry);
        // we loop over the results because 'add' supports multiple 
        // additions, but we only added one entry here so we only see
        // one log line in the output
        // for await (const { cid } of results) {
        const ipnsEntry = await node.name.publish("/ipfs/Qmae8ywsUskMjXsyCMWwwTGiUCPN5zgUgbsuqz3m5kgiu8");
        console.log("ipnsEntry", ipnsEntry);// and can be used to get it again.
        //   console.log(cid.toString())
        const publishedPubsub = await node.pubsub.publish("blabla",123)
        console.log(publishedPubsub);
        // console.log()
        // }
     return;
       

        
      const testAccountName = 'test-account'

    //   function checkMessage (msg) {
    //     publishedMessageKey = msg.from
    //     publishedMessage = msg
    //     publishedMessageData = ipns.unmarshal(msg.data)
    //     publishedMessageDataValue = uint8ArrayToString(publishedMessageData.value)
    //   }

      const alreadySubscribed = () => {
        return publishedMessage !== null
      }



      const keys = ipns.getIdKeys(uint8ArrayFromString(testAccount.id, 'base58btc'))
      const topic = `${namespace}${uint8ArrayToString(keys.routingKey.uint8Array(), 'base64url')}`

      await nodeB.pubsub.subscribe(topic, checkMessage)
      node.name.publish(ipfsRef, { resolve: false, key: testAccountName })
      await waitFor(alreadySubscribed)
      const messageKey = await PeerId.createFromB58String(publishedMessageKey)
      const pubKeyPeerId = await PeerId.createFromPubKey(publishedMessageData.pubKey)

      expect(pubKeyPeerId.toB58String()).not.to.equal(messageKey.toB58String())
      expect(pubKeyPeerId.toB58String()).to.equal(testAccount.id)
      expect(publishedMessage.from).to.equal(idA.id)
      expect(messageKey.toB58String()).to.equal(idA.id)
      expect(publishedMessageDataValue).to.equal(ipfsRef)

      // Verify the signature
      await ipns.validate(pubKeyPeerId._pubKey, publishedMessageData)
    })();
