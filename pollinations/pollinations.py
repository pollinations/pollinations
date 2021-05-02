import stomp

conn = stomp.Connection([('b-4e89df1f-8226-4cc4-a518-4e1ac0023c97-1.mq.eu-central-1.amazonaws.com', 61614)], use_ssl=True)
conn.connect('guest', 'iamcolabguest', wait=True)
conn.send(body='hello', destination='/queue/test')
conn.disconnect()

