require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const all = await Message.find({}).select('requestId senderId recipientId message timestamp').lean();
  console.log('სულ მესიჯი ბაზაში:', all.length);

  const uniqueRequestIds = [...new Set(all.map(m => m.requestId))];
  console.log('უნიკალური requestId-ები:', uniqueRequestIds);

  uniqueRequestIds.forEach(rid => {
    const msgs = all.filter(m => m.requestId === rid);
    const pairs = new Set(msgs.map(m => [m.senderId, m.recipientId].sort().join('-')));
    console.log(`\nrequestId=${rid}: ${msgs.length} მესიჯი, წყვილები:`, [...pairs]);
  });

  process.exit(0);
});