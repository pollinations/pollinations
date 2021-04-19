import { Client } from '@stomp/stompjs';

export default function open(onReceivedConsole, onReceivedMedia) {

    const client = new Client({
            brokerURL: 'wss://b-4e89df1f-8226-4cc4-a518-4e1ac0023c97-1.mq.eu-central-1.amazonaws.com:61619',
            connectHeaders: {
            login: 'guest',
            passcode: 'iamcolabguest',
        },
        debug: function (str) {
            console.debug(str);
        }
    });

    console.log(client.brokerURL);


    client.onConnect = function (frame) {
        // Do something, all subscribes must be done is this callback
        // This is needed because this will be executed after a (re)connect
        console.log("Connect", frame);
        client.subscribe('/topic/colabOut', m => onReceivedConsole(m));
        client.subscribe('/topic/colabMediaOut', m => onReceivedMedia(m));
        
        // client.publish({ destination: '/topic/general', body: 'Hello world' });

    };
    
    client.onStompError = function (frame) {
        // Will be invoked in case of error encountered at Broker
        // Bad login/passcode typically will cause an error
        // Complaint brokers will set `message` header with a brief message. Body may contain details.
        // Compliant brokers will terminate the connection after any error
        console.log('Broker reported error: ' + frame.headers['message']);
        console.log('Additional details: ' + frame.body);
    };
    
    client.activate();
    console.log(client)
    const publishToQueue = (body,headers={}) => {
        console.log("publishing",body,headers)
        client.publish({destination:"/queue/deep-daze",headers,body});
    }
    return publishToQueue;
};