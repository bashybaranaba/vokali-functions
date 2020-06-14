const {admin, db} = require('../util/admin');

const config = require('../util/config');
const { reduceProductDetails } = require('../util/validators')

exports.getAllProducts = (req, res) => {
    db
        .collection('products')
        .orderBy('createdAt', 'desc')
        .get()
        .then((data) => {
            let products = [];
            data.forEach((doc) => {
                products.push({
                    productId: doc.id,
                    description: doc.data().description,
                    price: doc.data().price,
                    title: doc.data().title,
                    imageUrl: doc.data().imageUrl,
                    createdAt: doc.data().createdAt,
                    storeName: doc.data().storeName,
                    storeImage:doc.data().storeImage,
                    likeCount: doc.data().likeCount,
                    orderCount: doc.data().orderCount,
                    reviewCount: doc.data().reviewCount,
                });
            });
            return res.json(products);
        })
        .catch((err) => console.error(err));
};

 exports.postOneProduct = (req, res) => {
   let imageUrl;
   let title;
   let price;
   let description;

   const BusBoy = require('busboy');
   const path = require('path');
   const os = require('os');
   const fs = require('fs');

   const busboy = new BusBoy({ headers: req.headers });

   let imageToBeUploaded = {};
   let imageFileName;

   busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
       //extract intput-field from upload-form
       if(fieldname == 'title') title=val;
       if(fieldname == 'price') price=val;
       if(fieldname == 'description') description=val;
   });
   busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
     console.log(fieldname, file, filename, encoding, mimetype);
     if (mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
       return res.status(400).json({ error: 'Wrong file type submitted' });
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
         imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
           config.storageBucket
         }/o/${imageFileName}?alt=media`;

         const newProduct = {
             title: title,
             price: price,
             description: description,
             createdAt: new Date().toISOString(),
             likeCount:0,
             reviewCount:0,
             orderCount: 0,
             storeName: req.user.userName,
             storeImage: req.user.imageUrl,
             imageUrl: imageUrl,
         };

         db .collection('products')
             .add(newProduct)
             .then(doc => {
                 const resProduct = newProduct;
                 resProduct.productId = doc.id;
                 res.json(resProduct);
             })

       })
       .then(() => {
         return res.json({ message: 'product uploaded successfully' });
       })
       .catch((err) => {
         console.error(err);
         return res.status(500).json({ error: 'something went wrong' });
       });
   });
   busboy.end(req.rawBody);
};

exports.addProductDetails = (req, res) => {

  const productDetails={
    description: req.body.description,
    price: req.body.price,
    title: req.body.title,
  }

  const productDocument = db.doc(`/products/${req.params.productId}`);
    productDocument.update(productDetails)
    .then(() => {
      return res.json({ message: 'Details added successfully' });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
}

// Fetch one product
exports.getProduct = (req, res) => {
    let productData = {};
    db.doc(`/products/${req.params.productId}`)
      .get()
      .then((doc) => {
        if (!doc.exists) {
          return res.status(404).json({ error: 'Product not found' });
        }
        productData = doc.data();
        productData.productId = doc.id;
        return db
          .collection('reviews')
          .orderBy('createdAt', 'desc')
          .where('productId', '==', req.params.productId)
          .get();
      })
      .then((data) => {
        productData.reviews = [];
        data.forEach((doc) => {
          productData.reviews.push(doc.data());
        });
        return db
          .collection('orders')
          .orderBy('createdAt', 'desc')
          .where('productId', '==', req.params.productId)
          .get();
      })
      .then((data) => {
        productData.orders = [];
        data.forEach((doc) => {
          productData.orders.push(doc.data());
        });
        return res.json(productData);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.code });
      });
  };

  // Like a product
  exports.likeProduct = (req, res) => {
    const likeDocument = db
      .collection('likes')
      .where('storeName', '==', req.user.userName)
      .where('productId', '==', req.params.productId)
      .limit(1);

    const productDocument = db.doc(`/products/${req.params.productId}`);

    let productData;

    productDocument
      .get()
      .then((doc) => {
        if (doc.exists) {
          productData = doc.data();
          productData.productId = doc.id;
          return likeDocument.get();
        } else {
          return res.status(404).json({ error: 'Product not found' });
        }
      })
      .then((data) => {
        if (data.empty) {
          return db
            .collection('likes')
            .add({
              productId: req.params.productId,
              storeName: req.user.userName
            })
            .then(() => {
              productData.likeCount++;
              return productDocument.update({ likeCount: productData.likeCount });
            })
            .then(() => {
              return res.json(productData);
            });
        } else {
          return res.status(400).json({ error: 'Product already liked' });
        }
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.code });
      });
  };

  exports.unlikeProduct = (req, res) => {
    const likeDocument = db
      .collection('likes')
      .where('storeName', '==', req.user.userName)
      .where('productId', '==', req.params.productId)
      .limit(1);

    const productDocument = db.doc(`/products/${req.params.productId}`);

    let productData;

    productDocument
      .get()
      .then((doc) => {
        if (doc.exists) {
          productData = doc.data();
          productData.productId = doc.id;
          return likeDocument.get();
        } else {
          return res.status(404).json({ error: 'Product not found' });
        }
      })
      .then((data) => {
        if (data.empty) {
          return res.status(400).json({ error: 'Product not liked' });
        } else {
          return db
            .doc(`/likes/${data.docs[0].id}`)
            .delete()
            .then(() => {
              productData.likeCount--;
              return productDocument.update({ likeCount: productData.likeCount });
            })
            .then(() => {
              res.json(productData);
            });
        }
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.code });
      });
  };

//order a product
exports.orderProduct = (req, res) => {

  const newOrder = {
    location: req.body.location,
    fullName: req.body.fullName,
    phoneNumber: req.body.phoneNumber,
    emailAdress: req.body.emailAdress,
    orderNotes: req.body.orderNotes,
    productId: req.params.productId,
    storeName: req.user.userName,
    createdAt: new Date().toISOString(),
    userImage: req.user.imageUrl
  };
  console.log(newOrder);

  db.doc(`/products/${req.params.productId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: 'product not found' });
      }
      return doc.ref.update({ orderCount: doc.data().orderCount + 1 });
    })
    .then(() => {
      return db.collection('orders').add(newOrder);
    })
    .then(() => {
      res.json(newOrder);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ error: 'Something went wrong' });
    });
};

// REVIEW  a product
exports.reviewProduct = (req, res) => {
  if (req.body.body.trim() === '')
    return res.status(400).json({ review: 'Must not be empty' });

  const newReview = {
    body: req.body.body,
    createdAt: new Date().toISOString(),
    productId: req.params.productId,
    storeName: req.user.userName,
    userImage: req.user.imageUrl
  };
  console.log(newReview);

  db.doc(`/products/${req.params.productId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: 'product not found' });
      }
      return doc.ref.update({ reviewCount: doc.data().reviewCount + 1 });
    })
    .then(() => {
      return db.collection('reviews').add(newReview);
    })
    .then(() => {
      res.json(newReview);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ error: 'Something went wrong' });
    });
};

// Delete a product
exports.deleteProduct = (req, res) => {
  const document = db.doc(`/products/${req.params.productId}`);
  document
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: 'Product not found' });
      }
      if (doc.data().userHandle !== req.user.handle) {
        return res.status(403).json({ error: 'Unauthorized' });
      } else {
        return document.delete();
      }
    })
    .then(() => {
      res.json({ message: 'Product deleted successfully' });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
