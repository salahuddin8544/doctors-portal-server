const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const ObjectId = require('mongodb').ObjectId
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const app = express();
require('dotenv').config()
//middleware middle
app.use(cors());
app.use(express.json());
const stripe = require("stripe")(process.env.PAYMENT_INTEGRATION_KEY);


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.mdunt9i.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

function verifyJWT (req, res, next){
  const authHeader = req.headers.authorization;
  if (authHeader === 0) {
    return res.status(401).send('unauthorized access hello');
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token,process.env.ACCESS_TOKEN, function(err,decoded){
    if (err){
      console.log(err);
      return res.status(403).send({message:'forbidden access'})
    }
    req.decoded = decoded
    next();
  })
  
}



// function verifyToken(req, res, next) {
//   const header = req.headers.authorization;
//   // console.log('inseide token', req.query.email);
//   if (!header) {
//       return res.status(401).send({ message: 'unauthorized access' });
//   }
//   const token = header.split(' ')[1];
//   jwt.verify(token, process.env.JWT_ALGO_SECRET, (err, decoded) => {
//       if (err) {
//           return res.status(403).send({ message: 'Forbidden' });
//       }
//       req.decoded = decoded;
//   })
//   next()
//   }
async function run (){
    try {
        const availableOptionsClient =  client.db('doctorsPortals').collection('appointmentOption');
        const bookingCollection = client.db('doctorsPortals').collection('bookings')
        const userCollection = client.db('doctorsPortals').collection('users')
        const doctorCollection = client.db('doctorsPortals').collection('doctors')
        const paymentCollection = client.db('doctorsPortals').collection('payment')

        // verify admin after verifyjwt
        const verifyAdmin = async (req,res,next)=>{
          const decodedEmail = req.decoded.email
        const query= {email: decodedEmail};
        const user = await userCollection.findOne(query);
        if (user?.role !== 'admin') {
          return res.status(403).send({message:'forbidden access'})
        }
        next()
        }

        app.get('/appointmentOption', async (req, res) => {
          const date = req.query.date;
          // console.log(date);
            const query = {};
            const options = await availableOptionsClient.find(query).toArray();
            const bookingQuery = {appoinmentDate: date}
            const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();
            // console.log(alreadyBooked);
            options.forEach(option=>{
              const optionBooked = alreadyBooked.filter(book=>book.treatement === option.name);
              const bookedSlots = optionBooked.map(book=>book.slot)
             const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
             option.slots = remainingSlots
            })
            res.send(options)
        })
        

        // mongodb agrigate versions of agrigate and lookup
        // app.get('/v2/appointmentOption', async (req,res)=>{
        //   const date = req.query.date;
        //   const options = availableOptionsClient.aggregate([
        //     {
        //       $lookup:
        //         {
        //           from: 'bookings',
        //           localField:'name',
        //           foreignField: 'treatment',
        //           pipleline:[
        //             {
        //               $match:{
        //                 $expr:{
        //                   $eq:'appoinmentDate'
        //                 }
        //               }
        //             }
        //           ],
        //           as: 'booked'
        //         }
        //    },
        //    {
        //     $project:{
        //       name:1,
        //       slots:1,
        //       booked:{
        //         $map:{
        //           input:'$booked',
        //           as:'book',
        //           in:'$$book.slot'
        //         }
        //       }
        //     }
        //    },
        //    {
        //     $project:{
        //       name:1,
        //       slots:{
        //         $setDifference:['$slots','$booked']
        //       }
        //     }
        //    }
        //   ]).toArray();
        //   res.send(options)
        // })


        /**
         * 
         * API Nameing Conventions
         * app.get('/bookings)
         * app.get('/bookings/:id)
         * app.post('/bookings)
         * app.patch('/bookings/:id)
         * app.delete('/bookings/:id)
        */

        // add ad doctor specializations
        app.get('/appointmentSpecialty', async (req,res)=>{
          const query ={};
          const result = await availableOptionsClient.find(query).project({name:1}).toArray();
          res.send(result);
        })
         // get my bookings from database by email address
         app.get('/bookings/',verifyJWT, async(req,res)=>{
          const email = req.query.email;
          const decodedEmail = req.decoded.email;
          if(email !== decodedEmail){
            return res.status(403).send({message:'forbidden access',})
          }
          const query = {email: email}
          const bookings = await bookingCollection.find(query).toArray()
          res.send(bookings)
        })
        // get booking by id
        app.get('/bookings/:id', async (req, res) => {
          const id = req.params.id;
          const query = {_id: new ObjectId(id)}
          const bookings = await bookingCollection.findOne(query)
          res.send(bookings)
        })
       

        // jsonwebtoken is here
        app.get('/jwt', async (req, res) => {
          const email = req.query.email;
          const query = {email: email};
         
          const user = await userCollection.findOne(query);
          if (user) {
            const token = jwt.sign({email}, process.env.ACCESS_TOKEN,{expiresIn:'4h'})
            return res.send({acceToken:token});
          }
          res.status(403).send({acceToken:''})
        })

        //payment update
        app.post('/payments', async (req, res) => {
          const payment = req.body;
          const result = await paymentCollection.insertOne(payment);
          const id = payment.bookingId;
          const filter = {_id: new ObjectId(id)}
          const updateDoc = {
            $set:{
              paid:true,
              transactionId:payment.transactionId
            }
          }
          const updateResult = await bookingCollection.updateOne(filter, updateDoc)
          res.send(result)
        })
       
        // payment intent
        app.post ('/create-payment-intent', async(req, res) => {
          const booking = req.body;
          const price = booking.price;
          const paymentIntent = await stripe.paymentIntents.create({
            amount: price * 100,
             currency :'usd',
             "payment_method_types": [
              "card"
            ],
  
          })
          res.send({
            clientSecret: paymentIntent.client_secret,
          });
         
        })
        
        // create user 
        app.post('/users', async (req, res)=>{
          const user = req.body;
          const result = await userCollection.insertOne(user);
          res.send(result);
        })

      // get all users
      app.get('/users', async (req, res)=>{
        const query = {};
        const users = await userCollection.find(query).toArray();
        res.send(users);
      })

        // post booking 
       app.post('/bookings', async (req,res) => {
        const booking = req.body;
        //pore kora
        const query = {
          appoinmentDate:booking.appoinmentDate,
          email: booking.email,
          treatement:booking.treatement
        }
        const alreadyBooked = await bookingCollection.find(query).toArray();
        if(alreadyBooked.length){
          const message = `Already have a booking on ${booking.appoinmentDate}`;
          return res.send({acknowledge:false,message})
        }
        const result = await bookingCollection.insertOne(booking);
        res.send(result)
       })

       // check admin permissions for user
       app.get('/users/admin/:email', async (req, res) => {
        const email = req.params.email
        const query = {email}
        const user = await userCollection.findOne(query);
        res.send({isAdmin: user?.role === 'admin'})
       })
      
       // delete a doctor
       app.delete('/doctors/admin/:id', verifyJWT,verifyAdmin, async (req, res) => {
          const id = req.params.id;
          const filter = {_id: new ObjectId(id)}
          const doctors = await doctorCollection.deleteOne(filter);
          res.send(doctors)
       })

       // make admin
       app.put('/users/admin/:id',verifyJWT,verifyAdmin, async (req, res)=>{
        //    const decodedEmail = req.decoded.email
        // const query= {email: decodedEmail};
        // const user = await userCollection.findOne(query);
        // if (user?.role !== 'admin') {
        //   return res.status(403).send({message:'forbidden access'})
        // }
         const id = req.params.id ;
        const filter = {_id: new ObjectId(id)};
        const options = {upsert:true};
        const updateDoc = {
            $set:{
                role:'admin'
            },
        };
        const result = await userCollection.updateOne(filter,updateDoc,options);
    res.send(result)
 })
 
 // get all doctors
 app.get('/doctors', async(req, res) => {
  const query = {};
  const result = await doctorCollection.find(query).toArray();
  res.send(result)
 })
     
 // add a doctor
app.post('/doctors', async(req, res)=>{
  const doctor = req.body;
  const result = await doctorCollection.insertOne(doctor)
  res.send(result);
})


// temporrary to update price field on appointment options 
app.get('/addPrice', async (req, res)=>{
  const filter = {}
  const options = {upsert: true}
  const updateDoc = {
    $set:{
      price:99
    }
  }
  const result = await availableOptionsClient.updateMany(filter,updateDoc,options)
  res.send(result)
})


    }
    finally{

    }
}
run().catch(console.log());


app.get('/',(req,res)=>{
    res.send('doctor portal is running');
})
app.listen(port,()=>console.log(`ports is ${port}`));