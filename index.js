const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000

//middleware
app.use(cors())
app.use(express.json())


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nfzb9rp.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
  
    const usersCollection = client.db("picStudio").collection("users")
   const classCollection = client.db("picStudio").collection("classes")
   const MySelectedClassCollection = client.db("picStudio").collection("selectedClass")
   const paymentClassCollection = client.db("picStudio").collection("payment")



    //jwt
    app.post('/jwt', (req, res) =>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'})
      res.send({token})
    })


    //verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (
        user?.role !== 'admin'
      ) {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }


    //users related api
app.get('/users',verifyJWT, verifyAdmin, async(req, res) =>{
  const result = await usersCollection.find().toArray()
  res.send(result)
})

//social media login user data save only one time in database
    app.post('/users', async(req, res) =>{
        const user =req.body
        const query = {email: user.email}
        const existingUser = await usersCollection.findOne(query)
        if(existingUser){
            return res.send({message: 'user already exists'})
        }
        const result = await usersCollection.insertOne(user)
        res.send(result)
    })

//classes
    app.get("/ourClasses", async (req, res) => {
      const result = await classCollection
        .find({ status: 'approve' })
        .toArray();
      res.send(result);
    });

  //   //selected class
  //   app.post('/mySelectedClasses', async(req, res)=>{
  //     const selectedClass = req.body;
  //     const result = await MySelectedClassCollection.insertOne(selectedClass)
  //     res.send(result)
  //  })

   //class only select for one time
  app.post("/mySelectedClasses", async (req, res) => {
    const selectedClass = req.body;
    const query ={classItemId: selectedClass.classItemId}
    const existedId = await MySelectedClassCollection.findOne(query)
    if(existedId){
      return res.send({ message: "already exist" })
    }
    const result = await MySelectedClassCollection.insertOne(selectedClass);
    res.send(result);
  });

     //student dashboard
     app.get('/mySelectedAllClasses', async(req, res)=>{
      const result = await MySelectedClassCollection.find().toArray()
      res.send(result)
  })
  


//Instructor
    app.get("/ourInstructor", async (req, res) => {
      const result = await usersCollection
        .find({ role: 'instructor' })
        .toArray();
      res.send(result);
    });
    
    //popular instructor
    app.get("/popularInstructor", async (req, res) => {
      const result = await usersCollection
        .find({ role: "instructor" })
        .limit(6)
        .toArray();
      res.send(result);
    });


    //admin api
    app.patch('/users/admin/:id', async(req, res) =>{
      const id = req.params.id
      const filter = {_id: new ObjectId(id)}
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      }
      const result = await usersCollection.updateOne(filter, updateDoc)
      res.send(result)
    })


    
    // check admin

    // app.get('/users/admin/:email', verifyJWT,  async (req, res) => {
    //   const email = req.params.email;

    //   if (req.decoded.email !== email) {
    //     res.send({ admin: false })
    //   } 

    //   const query = { email: email }
    //   const user = await usersCollection.findOne(query);
    //   const result = { admin: user?.role === 'admin' }
    //   res.send(result);
    // })



//role 

    app.get("/users/role/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      } 
  
      let role;
      if (user.role === "admin") {
        role = "admin";
      } 
      else if (user.role === "instructor") {
role = "instructor";
      } 
     
      else {
        role = "student";
      }
    res.send({email: email, role: role})
    })



//admin approved class

app.patch('/classes/approve/:id', async (req, res)=>{
  const id =req.params.id;
  const filter = {_id : new ObjectId(id)}
  const updateDoc = {
     $set:{
       status: 'approve'
     },
  }
  const result = await classCollection.updateOne(filter, updateDoc);
  res.send(result)
})

//admin denied class
app.patch('/classes/deny/:id', async (req, res)=>{
  const id =req.params.id;
  const filter = {_id : new ObjectId(id)}
  const updateDoc = {
     $set:{
       status: 'deny'
     },
  }
  const result = await classCollection.updateOne(filter, updateDoc);
  res.send(result)
})



 //feedback
 app.patch("/feedback/:id", async (req, res) => {
  const id = req.params.id;
  const filter = {_id: new ObjectId(id)};
  const options = { upsert: true };
  const feedbackUpdate = req.body;
  const update = {
    $set: {
     feedback: feedbackUpdate.feedback,
      },
  };
  const result = await classCollection.updateOne(filter, update, options);
  res.send(result);
});




 //instructor api
 app.patch('/users/instructor/:id', async(req, res) =>{
  const id = req.params.id
  const filter = {_id: new ObjectId(id)}
  const updateDoc = {
    $set: {
      role: 'instructor'
    },
  }
  const result = await usersCollection.updateOne(filter, updateDoc)
  res.send(result)
})
   


   //add a class
   app.post('/classes', async(req, res)=>{
    const addClass = req.body;
    const result = await classCollection.insertOne(addClass)
    res.send(result);
 })

     //get all instructor class
     app.get('/allClasses', async (req, res)=>{
      const result= await classCollection.find().toArray()
      res.send(result)
   })



   
    //create payment
    app.post('/create-payment-intent', verifyJWT, async (req, res)=>{
      const {price} = req.body;
      const amount = price*100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
  })

  app.post('/payment', verifyJWT, async(req, res)=>{
    const payment = req.body;
    const insertedResult = await paymentClassCollection.insertOne(payment)
    const query={_id: new ObjectId (payment.enrollItemId)}
    const deletedResult = await MySelectedClassCollection.deleteOne(query)
    res.send({insertedResult,  deletedResult})
  })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) =>{
    res.send('PicStudio is running')
})

app.listen(port, () =>{
    console.log(`PicStudio is running on port ${port}`)
})