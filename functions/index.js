const functions = require('firebase-functions');

const express = require('express')
const app = express();

const cors = require('cors');
app.use(cors());

const FBAuth = require('./util/fbAuth');

const {db} = require('./util/admin');


const { getAllProducts, postOneProduct, addProductDetails, getProduct, likeProduct, unlikeProduct, orderProduct, reviewProduct, deleteProduct } = require('./handlers/products')
const { signup, login, uploadImage, uploadBanner, getUserDetails, addUserDetails, getAuthenticatedUser, followUser, unfollowUser, markNotificationsRead } = require('./handlers/users')
const { createStore, uploadLogo,getStoreDetails } = require('./handlers/sellers')

//Products route
 app.get('/products', getAllProducts);
 app.post('/products', FBAuth, postOneProduct);
 app.post('/product/:productId/details', FBAuth, addProductDetails);
 app.get('/product/:productId', getProduct);
 app.get('/product/:productId/like', FBAuth, likeProduct);
 app.get('/product/:productId/unlike', FBAuth, unlikeProduct);
 app.post('/product/:productId/order', FBAuth, orderProduct);
 app.post('/product/:productId/review', FBAuth, reviewProduct);
 app.delete('/product/:productId', FBAuth, deleteProduct);

//User routes
app.post('/signup', signup);
app.post('/login', login);
app.post('/user/image', FBAuth, uploadImage);
app.post('/user/banner', FBAuth, uploadBanner);
app.post('/user', FBAuth, addUserDetails);
app.get('/user', FBAuth, getAuthenticatedUser);
app.get('/user/:userName', getUserDetails);
app.get('/user/:userName/follow', FBAuth, followUser);
app.get('/user/:userName/unfollow', FBAuth, unfollowUser);
app.post('/notifications', FBAuth, markNotificationsRead);

//Seller routes
app.post('/seller/create', FBAuth, createStore);
app.post('/seller/:sellerId/logo', FBAuth, uploadLogo);
app.get('/seller/:storeName', getStoreDetails);

exports.api = functions.https.onRequest(app);

exports.createNotificationOnLike = functions
  .firestore.document('likes/{id}')
  .onCreate((snapshot) => {
    return db
      .doc(`/products/${snapshot.data().productId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().storeName !== snapshot.data().storeName
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().storeName,
            sender: snapshot.data().storeName,
            type: 'like',
            read: false,
            productId: doc.id
          });
        }
      })
      .catch((err) => console.error(err));
  });
exports.deleteNotificationOnUnLike = functions
  .firestore.document('likes/{id}')
  .onDelete((snapshot) => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch((err) => {
        console.error(err);
        return;
      });
  });
exports.createNotificationOnReview = functions
  .firestore.document('reviews/{id}')
  .onCreate((snapshot) => {
    return db
      .doc(`/products/${snapshot.data().productId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().storeName !== snapshot.data().storeName
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().storeName,
            sender: snapshot.data().storeName,
            type: 'review',
            read: false,
            productId: doc.id
          });
        }
      })
      .catch((err) => {
        console.error(err);
        return;
      });
  });

  exports.createNotificationOnOrder = functions
    .firestore.document('orders/{id}')
    .onCreate((snapshot) => {
      return db
        .doc(`/products/${snapshot.data().productId}`)
        .get()
        .then((doc) => {
          if (
            doc.exists &&
            doc.data().storeName !== snapshot.data().storeName
          ) {
            return db.doc(`/notifications/${snapshot.id}`).set({
              createdAt: new Date().toISOString(),
              recipient: doc.data().storeName,
              sender: snapshot.data().storeName,
              type: 'order',
              read: false,
              productId: doc.id
            });
          }
        })
        .catch((err) => {
          console.error(err);
          return;
        });
    });

  exports.onUserImageChange = functions
    .firestore.document('/users/{userId}')
    .onUpdate((change) => {
      console.log(change.before.data());
      console.log(change.after.data());
      if (change.before.data().imageUrl !== change.after.data().imageUrl) {
        console.log('image has changed');
        const batch = db.batch();
        return db
          .collection('products')
          .where('userHandle', '==', change.before.data().handle)
          .get()
          .then((data) => {
            data.forEach((doc) => {
              const product = db.doc(`/products/${doc.id}`);
              batch.update(product, { userImage: change.after.data().imageUrl });
            });
            return batch.commit();
          });
      } else return true;
    });

exports.onProductDelete = functions
  .firestore.document('/products/{productId}')
  .onDelete((snapshot, context) => {
    const productId = context.params.productId;
    const batch = db.batch();
    return db
      .collection('reviews')
      .where('productId', '==', productId)
      .get()
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/reviews/${doc.id}`));
        });
        return db
          .collection('likes')
          .where('productId', '==', productId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection('notifications')
          .where('productId', '==', productId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch((err) => console.error(err));
  });
