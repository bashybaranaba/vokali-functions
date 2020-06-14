const { admin, db } = require('../util/admin');

const config = require('../util/config');

const { reduceStoreDetails } = require('../util/validators')

//Create new Store
exports.createStore = (request, response) => {
    const newStore = {
        storeName:request.body.storeName,
        storeDescription:request.body.storeDescription,
        createdBy: request.user.userName,
    };
    const nologo = 'no-image.png';
    const nobanner = 'no-image.png';
    db.doc(`/sellers/${newStore.storeName}`).get()
        .then(doc => {
            const storeCredentials = {
                storeName: newStore.storeName,
                storeDescription: newStore.storeDescription,
                createdBy: newStore.createdBy,
                createdAt: new Date().toISOString(),
                logoUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${nologo}?alt=media`,
                bannerUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${nobanner}?alt=media`

            }
            if(doc.exists){
                return response.status(400).json({ storeName: 'this store name is already taken'});
            } else {
                return db.doc(`/sellers/${newStore.storeName}`).set(storeCredentials);
            }
        })
        .then(() => {
            response.json({ message: 'created store successfully' });
          })
        .catch(err =>{
            response.status(500).json({error: 'something went wrong'});
            console.error(err);
        });
 }


 // Add store details
 exports.addStoreDetails = (request, response) => {
     let storeDetails = reduceStoreDetails(request.body);

     db.doc(`/sellers/${newStore.storeName}`)
       .update(storeDetails)
       .then(() => {
         return response.json({ message: 'Details added successfully' });
       })
       .catch((err) => {
         console.error(err);
         return response.status(500).json({ error: err.code });
       });
   };

   // Get any store's details
   exports.getStoreDetails = (request, response) => {
     let storeData = {};
     db.doc(`/sellers/${request.params.sellerId}`)
       .get()
       .then((doc) => {
         if (doc.exists) {
           storeData.user = doc.data();
           return db
             .collection("products")
             .where("storeName", "==", request.params.sellerId)
             .get();
         } else {
           return response.status(404).json({ errror: "Store not found" });
         }
       })
       .then((data) => {
         storeData.products = [];
         data.forEach((doc) => {
           storeData.products.push({
             description: doc.data().description,
             price: doc.data().price,
             title: doc.data().title,
             imageUrl: doc.data().imageUrl,
             createdAt: doc.data().createdAt,
             userName: doc.data().userName,
             reviewCount: doc.data().reviewCount,
             productId: doc.id,
           });
         });
         return response.json(storeData);
       })
       .catch((err) => {
         console.error(err);
         return response.status(500).json({ error: err.code });
       });
   };

 //Get own store details
 exports.getStoreDetails = (request, response) => {
     let storeData = {};
     db.doc(`/sellers/${request.params.sellerId}`).get()
     .then(doc => {
         if(doc.exists){
             storeData.credentials = doc.data();
             return db.collection('likes').where('storeName', '==', request.params.sellerId).get()
         }
     })
     .then(data => {
         storeData.likes = [];
         data.forEach(doc => {
             storeData.likes.push(doc.data())
         });
         return response.json(userData)
     })
     .catch((err) => {
         console.error(err);
         return response.status(500).json({ error: err.code});
       });
 }


//Upload logo
exports.uploadLogo = (request, response) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const busboy = new BusBoy({ headers: request.headers });

    let imageToBeUploaded = {};
    let imageFileName;

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      console.log(fieldname, file, filename, encoding, mimetype);
      if (mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
        return response.status(400).json({ error: 'Wrong file type submitted' });
      }
      // my.image.png => ['my', 'image', 'png']
      const imageExtension = filename.split('.')[filename.split('.').length - 1];
      // 32756238461724837.png
      imageFileName = `${Math.round(
        Math.random() * 1000000000000
      ).toString()}.${imageExtension}`;
      const filepath = path.join(os.tmpdir(), imageFileName);
      imageToBeUploaded = { filepath, mimetype };
      file.pipe(fs.createWriteStream(filepath));
    });
    busboy.on('finish', () => {
      admin
        .storage()
        .bucket(`${config.storageBucket}`)
        .upload(imageToBeUploaded.filepath, {
          resumable: false,
          metadata: {
            metadata: {
              contentType: imageToBeUploaded.mimetype
            }
          }
        })
        .then(() => {
          const logoUrl = `https://firebasestorage.googleapis.com/v0/b/${
            config.storageBucket
          }/o/${imageFileName}?alt=media`;
          return db.doc(`/sellers/${request.params.sellerId}`).update({ logoUrl });
        })
        .then(() => {
          return response.json({ message: 'image uploaded successfully' });
        })
        .catch((err) => {
          console.error(err);
          return response.status(500).json({ error: 'something went wrong' });
        });
    });
    busboy.end(request.rawBody);
  };

//Upload banner
