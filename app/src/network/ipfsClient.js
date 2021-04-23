
 import Client from 'ipfs-http-client';



const connect = async () => {
    const client = Client('http://18.157.173.110:5002')
    console.log({client})
    const { cid } = await client.add('Hello world!')
    console.log(cid)
}

connect();
