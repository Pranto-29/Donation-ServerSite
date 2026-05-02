
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const crypto = require('crypto');
const { data } = require('react-router');

const port = process.env.PORT || 5000;
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

const stripe = require('stripe')('sk_test_51T4TSaIgAEGFtg7S5k2ucebPt1kaFg2cJwzYPWBa5k6Sm0cJKbTsHIb2GKOZMPT93wiBlZos0ALq3qGDPn3RTH5y00aakNUGOy')

// Firebase Admin initialization
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Firebase token verification middleware
// const verifyFBToken = async (req, res, next)=>{
//   const token = req.headers.authorization;
  
//   if(!token) {
//     return res.status(401).send({message : 'unauthorization accses'})
//   }

//   try {
//     const idToken = token.split(' ')[1]
//     const decoded = await admin.auth().verifyIdToken(idToken)
//     console.log('decoded info',decoded)
//     req.decoded_email = decoded.email
//     next();
//   }
//   catch(error){
//        return res.status(401).send({message : 'unauthorization accses'})
//   }
// }
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    req.decoded_email = decoded.email;

    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid token" });
  }
};
// MongoDB connection
const uri = process.env.MONGO_URI; 
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Global declaration of paymentCollection
let paymentCollection; 

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("MongoDB connected");

    const database = client.db('wave-2');
    const userCollections = database.collection('user');
    const productCollections = database.collection('products');
    const requestCollections = database.collection('requests');
    const bloodCollection = database.collection('donations');
    const paymentCollection = database.collection('payments'); 

//  ------------------ USER ROUTES ------------------

    app.post('/user', async (req, res) => {
      try {
        const userInfo = req.body;
        userInfo.role = "donnar";
        userInfo.status = 'active';
        userInfo.createdAt = new Date();
        const result = await userCollections.insertOne(userInfo);
        res.status(201).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to create user", error: error.message });
      }
    });

//     app.post('/user', async (req, res) => {
//   try {
//     const userInfo = req.body;

//     if (!userInfo.email) {
//       return res.status(400).send({ message: "Email required" });
//     }

//     const existUser = await userCollections.findOne({ email: userInfo.email });

//     if (existUser) {
//       return res.status(200).send({ message: "User already exists" });
//     }

//     userInfo.role = "donnar";
//     userInfo.status = "active";
//     userInfo.createdAt = new Date();

//     const result = await userCollections.insertOne(userInfo);

//     res.status(201).send(result);

//   } catch (error) {
//     console.error(error);
//     res.status(500).send({ message: "Failed to create user" });
//   }
// });

    app.get('/user',verifyFBToken, async (req, res) => {
      try {
        const result = await userCollections.find().toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch users", error: error.message });
      }
    });

    
    app.get('/user/role/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollections.findOne({ email: email });
        console.log("User role query result:", user);
        res.status(200).send(user);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch user role", error: error.message });
      }
    });

    app.patch('/update/user/status/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const result = await userCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: status } }
        );
        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update user status", error: error.message });
      }
    });

    app.patch('/update/user/role/:id', verifyFBToken, async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body;

    const result = await userCollections.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: role } }
    );

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update role" });
  }
});

app.patch('/user/:email', verifyFBToken, async (req, res) => {
  try {
    const email = req.params.email;
    const updatedData = req.body;

    // security check
    if (req.decoded_email !== email) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    const result = await userCollections.updateOne(
      { email: email },
      {
        $set: {
          displayName: updatedData.displayName,
          photoURL: updatedData.photoURL,
          district: updatedData.district,
          upazila: updatedData.upazila,
          blood_group: updatedData.blood_group,
        }
      }
    );

    res.send(result);

  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Profile update failed" });
  }
});


app.get('/search-requests', async (req, res) => {
  try {
    const { bloodGroup, district, upazila } = req.query;
    const query = {};

    if (bloodGroup && bloodGroup.trim() !== "")
      query.blood_group = bloodGroup.trim().toUpperCase(); // AB-

    if (district && district.trim() !== "")
      query.recipient_district = new RegExp(`^${district.trim()}$`, "i"); 
     

    if (upazila && upazila.trim() !== "")
      query.recipient_upazila = new RegExp(`^${upazila.trim()}$`, "i");

    console.log("MongoDB query:", query);

    const result = await requestCollections .find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Internal server error" });
  }

});



    // ------------------ PRODUCT ROUTES ------------------

    app.post('/products', async (req, res) => {
      try {
        const product = req.body;
        product.createdAt = new Date();
        const result = await productCollections.insertOne(product);
        res.status(201).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to add product", error: error.message });
      }
    });

    app.get('/manager/products/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const products = await productCollections.find({ productManagerEmail: email }).toArray();
        res.status(200).send(products);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch products", error: error.message });
      }
    });

    // ------------------ REQUEST ROUTES ------------------

    app.post('/requests', verifyFBToken, async (req, res) => {
      try {
        const requestData = req.body;
        requestData.requester_email = req.decoded_email;
        requestData.requester_name = req.decode_name || "No Name";
        requestData.createdAt = new Date();
        const result = await requestCollections.insertOne(requestData);
        res.status(201).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to add request" });
      }
    });

    // app.get('/requests', async (req, res) => {
    //   try {
    //     const requests = await requestCollections.find().toArray();
    //     res.status(200).send(requests);
    //   } catch (error) {
    //     console.error(error);
    //     res.status(500).send({ message: "Failed to fetch requests", error: error.message });
    //   }
    // });

app.get('/requests/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const request = await requestCollections.findOne({ _id: new ObjectId(id) });

    if (!request) {
      return res.status(404).send({ message: "Request not found" });
    }

    res.status(200).send(request);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch request", error: err.message });
  }
});

app.get('/requests', async (req, res) => {
  try {
    const page = Number(req.query.page) || 0;
    const size = Number(req.query.size) || 8;
    const filter = req.query.filter || "all";

    let query = {};

    if (filter !== "all") {
      query.donation_status = filter;
    }

    const result = await requestCollections
      .find(query)
      .sort({ createdAt: -1 })
      .skip(page * size)
      .limit(size)
      .toArray();

    const totalRequest = await requestCollections.countDocuments(query);

    res.send({
      request: result,
      totalRequest,
    });

  } catch (err) {
    res.status(500).send({ message: "Failed to fetch requests" });
  }
});
    app.get('/my-request', verifyFBToken, async(req, res) =>{
      try {
        const email = req.decoded_email;
        const size = Number(req.query.size);
        const page = Number(req.query.page);
         const query = {};
        const user = await userCollections.findOne({ email: email });
        
        if( user.role == 'donnar')
          {
            query.requester_email = email;}
        const result = await requestCollections.find(query)
          .limit(5)
          .skip(size*page)
          .toArray();

        const totalRequest = await requestCollections.countDocuments(query);

        res.send({ request: result, totalRequest });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch my requests" });
      }
    });

// app.delete('/my-request/:id', verifyFBToken, async (req, res) => {
//   try {
//     const email = req.decoded_email;
//     const id = req.params.id;

//     const request = await requestCollections.findOne({
//       _id: new ObjectId(id)
//     });

//     if (!request) {
//       return res.status(404).send({ success: false, message: "Not found" });
//     }

//     if (request.requester_email !== email) {
//       return res.status(403).send({ success: false, message: "Forbidden" });
//     }

//     const result = await requestCollections.deleteOne({
//       _id: new ObjectId(id)
//     });

//     res.send({
//       success: true,
//       deletedCount: result.deletedCount,
//       message: "Deleted successfully"
//     });

//   } catch (err) {
//     res.status(500).send({ success: false, message: "Server error" });
//   }
//   console.log("DELETE API HIT", req.params.id);
// });

app.delete('/my-requests/:id', verifyFBToken, async (req, res) => {
  try {
    const id = req.params.id;

    const result = await requestCollections.deleteOne({
      _id: new ObjectId(id)
    });

    res.send({ success: result.deletedCount > 0 });

  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

app.get('/my-requests', verifyFBToken, async (req, res) => {
  try {
    const email = req.decoded_email;
   console.log(email)
    const page = Number(req.query.page) || 0;
    const size = Number(req.query.size) || 8;
    const filter = req.query.filter || "all";

    let query = { requester_email: email };

    if (filter !== "all") {
      query.donation_status = filter;
    }

    const result = await requestCollections
      .find(query)
      .sort({ createdAt: -1 })
      .skip(page * size)
      .limit(size)
      .toArray();

    const totalRequest = await requestCollections.countDocuments(query);

    res.send({ request: result, totalRequest });
  } catch (err) {
    res.status(500).send({ message: "Failed" });
  }
});

    
// app.get('/requests/:id', async (req, res) => {
//   try {
//     const id = req.params.id;
//     const request = await requestCollections.findOne({ _id: new ObjectId(id) });

//     if (!request) {
//       return res.status(404).send({ message: "Request not found" });
//     }

//     res.status(200).send(request);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to fetch request", error: err.message });
//   }
// });



app.get('/my-requests-home', verifyFBToken, async (req, res) => {
  try {
    const email = req.decoded_email;

    const result = await requestCollections
      .find({ requester_email: email })
      .sort({ createdAt: -1 })   
      .limit(3)                
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch dashboard requests" });
  }
});

app.patch('/requests/:id', verifyFBToken, async (req, res) => {
  try {
    const id = req.params.id;
    const { donation_status } = req.body;

    const result = await requestCollections.updateOne(
      { _id: new ObjectId(id) },
      { $set: { donation_status } }
    );

    res.send({
      success: true,
      modifiedCount: result.modifiedCount
    });

  } catch (err) {
    res.status(500).send({
      success: false,
      message: "Update failed"
    });
  }
});
app.patch('/update-request/:id', async (req, res) => {
  const id = req.params.id;
  const data = req.body;

  const result = await requestCollections.updateOne(
    { _id: new ObjectId(id) },
    { $set: data }
  );

  res.send({ success: true });
});
// ------------------ PAYMENT ROUTES ------------------

app.post('/create-payment-checkout', async (req, res) => {
    try {
        const { amount, donorName, donorEmail } = req.body;

        if (!amount || amount <= 0) return res.status(400).send({ error: "Invalid amount" });
        if (!donorEmail) return res.status(400).send({ error: "Email required" });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: { name: `Donation from ${donorName || 'Anonymous'}` },
                        unit_amount: amount * 100,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            customer_email: donorEmail,
            metadata: { donorName: donorName || 'Anonymous' },
            success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`,
        });

        res.send({ url: session.url });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: error.message });
    }
});

app.post('/success-payment', async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).send({ error: "Session ID required" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Ensure payment completed
    if (session.payment_status !== 'paid') {
      return res.status(400).send({ message: "Payment not completed" });
    }

    const transactionId = session.payment_intent;

    // Prevent duplicate insert
    const isPaymentExist = await paymentCollection.findOne({ transactionId });

    if (isPaymentExist) {
      return res.send({ message: "Payment already recorded" });
    }

    const paymentInfo = {
      amount: session.amount_total / 100,
      currency: session.currency,
      donorEmail: session.customer_details?.email,
      transactionId,
      payment_status: session.payment_status,
      paidAt: new Date()
    };

    const result = await paymentCollection.insertOne(paymentInfo);

    res.send({ success: true, result });

  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

app.get('/payments', async (req, res) => {
  const result = await paymentCollection.find().toArray();
  res.send(result);
});


// })

app.get('/search-requests', async (req, res) => {
  try {
    const { bloodGroup, district, upazila } = req.query;
    const query = {};

    if (bloodGroup && bloodGroup.trim() !== "")
      query.blood_group = bloodGroup.trim().toUpperCase(); // AB-

    if (district && district.trim() !== "")
      query.recipient_district = new RegExp(`^${district.trim()}$`, "i"); 
     

    if (upazila && upazila.trim() !== "")
      query.recipient_upazila = new RegExp(`^${upazila.trim()}$`, "i");

    console.log("MongoDB query:", query);

    const result = await requestCollections .find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Internal server error" });
  }

});


app.get('/my-payments', async (req, res) => {
  const email = req.query.email;

  const result = await paymentCollection
    .find({ donorEmail: email })
    .sort({ paidAt: -1 })
    .toArray();

  res.send(result);
});


  } catch (error) {
    console.error("MongoDB connection failed", error);
  }
}


// Run MongoDB connection
run().catch(console.dir);

// Root route
app.get('/', (req, res) => {
  res.send("Hello, Server is Running");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

