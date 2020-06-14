const { admin, db } = require('../util/admin');

const config = require('../util/config')

const firebase = require('firebase');
firebase.initializeApp(config)

const { validateSignupData, validateLoginData, reduceUserDetails } = require('../util/validators')

//User Signup
exports.signup = (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    fullName: req.body.fullName,
    userName: req.body.userName,
  };

  const { valid, errors } = validateSignupData(newUser);

  if (!valid) return res.status(400).json(errors);

  const noImg = "no-image.png";
  const nobanner = 'add-photo.png';

  let token, userId;
  db.doc(`/users/${newUser.userName}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.status(400).json({ userName: "this userName is already taken" });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then((data) => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((idToken) => {
      token = idToken;
      const userCredentials = {
        userName: newUser.userName,
        fullName: newUser.fullName,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        followerCount: 0,
        //TODO Append token to imageUrl. Work around just add token from image in storage.
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
        bannerUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${nobanner}?alt=media`,
        userId,
      };
      return db.doc(`/users/${newUser.userName}`).set(userCredentials);
    })
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({ email: "Email is already is use" });
      } else {
        return res
          .status(500)
          .json({ general: "Something went wrong, please try again" });
      }
    });
};

 //user login
 exports.login = (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    };

    const { valid, errors} = validateLoginData(user);

    if(!valid) return res.status(400).json(errors);

    firebase.auth()
       .signInWithEmailAndPassword(user.email, user.password)
       .then((data) => {
           return data.user.getIdToken();
       })
       .then((token) => {
           return res.json({ token });
       })
       .catch((err) => {
           console.error(err);
           if(err.code === 'auth/wrong-password'){
               return res.status(403).json({ general: 'Wrong credentials please try again'});
           } else {
               return res.status(500).json({ error: err.code });
           }
       });

}

// Add user details
exports.addUserDetails = (req, res) => {
    let userDetails = reduceUserDetails(req.body);

    db.doc(`/users/${req.user.userName}`)
      .update(userDetails)
      .then(() => {
        return res.json({ message: 'Details added successfully' });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  };

  // Get any user's details
  exports.getUserDetails = (req, res) => {
    let userData = {};
    db.doc(`/users/${req.params.userName}`)
      .get()
      .then((doc) => {
        if (doc.exists) {
          userData.user = doc.data();
          return db
            .collection("products")
            .where("storeName", "==", req.params.userName)
            .orderBy('createdAt', 'desc')
            .get();
        } else {
          return res.status(404).json({ errror: "User not found" });
        }
      })
      .then((data) => {
        userData.products = [];
        data.forEach((doc) => {
          userData.products.push({
            description: doc.data().description,
            price: doc.data().price,
            title: doc.data().title,
            imageUrl: doc.data().imageUrl,
            createdAt: doc.data().createdAt,
            storeName: doc.data().storeName,
            likeCount: doc.data().likeCount,
            orderCount: doc.data().orderCount,
            reviewCount: doc.data().reviewCount,
            productId: doc.id,
          });
        });
        return res.json(userData);
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  };

//Get own user details\
exports.getAuthenticatedUser = (req, res) => {
    let userData = {};
    db.doc(`/users/${req.user.userName}`).get()
    .then(doc => {
        if(doc.exists){
            userData.credentials = doc.data();
            return db
            .collection('likes')
            .where('storeName', '==', req.user.userName)
            .get()
        }
    })
    .then((data) => {
      userData.likes = [];
      data.forEach((doc) => {
        userData.likes.push(doc.data());
      });
      return db
        .collection("notifications")
        .where("recipient", "==", req.user.userName)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
    })
    .then((data) => {
      userData.notifications = [];
      data.forEach((doc) => {
        userData.notifications.push({
          recipient: doc.data().recipient,
          sender: doc.data().sender,
          createdAt: doc.data().createdAt,
          productId: doc.data().productId,
          type: doc.data().type,
          read: doc.data().read,
          notificationId: doc.id,
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
}

//Follow User
exports.followUser = (req, res) => {
  const followerDocument = db
    .collection('follows')
    .where('follower', '==', req.user.userName)
    .where('following', '==', req.params.userName)
    .limit(1);

    const userDocument = db.doc(`/users/${req.params.userName}`)

    let userData;

    userDocument
      .get()
      .then((doc) => {
        if (doc.exists) {
          userData = doc.data();
          return followerDocument.get();
        } else {
          return res.status(404).json({ errror: "User not found" });
        }
      })

    .then((data) => {
      if (data.empty) {
        return db
          .collection('follows')
          .add({
            follower: req.user.userName,
            following: req.params.userName
          })
          .then(() => {
            userData.followerCount++;
            return userDocument.update({ followerCount: userData.followerCount });
          })
          .then(() => {
            return res.json(userData);
          });
      } else {
        return res.status(400).json({ error: 'Already following user' });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

//Unfollow
exports.unfollowUser = (req, res) => {
  const followerDocument = db
    .collection('follows')
    .where('follower', '==', req.user.userName)
    .where('following', '==', req.params.userName)
    .limit(1);

    const userDocument = db.doc(`/users/${req.params.userName}`)

    let userData;

    userDocument
      .get()
      .then((doc) => {
        if (doc.exists) {
          userData = doc.data();
          return followerDocument.get();
        } else {
          return res.status(404).json({ errror: "User not found" });
        }
      })

    .then((data) => {
      if (data.empty) {
        return res.status(400).json({ error: 'You do not follow this user' });
      } else {
        return db
          .doc(`/follows/${data.docs[0].id}`)
          .delete()
          .then(() => {
            userData.followerCount--;
            return userDocument.update({ followerCount: userData.followerCount });
          })
          .then(() => {
            res.json(userData);
          });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};


//Upload profile image
exports.uploadImage = (req, res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const busboy = new BusBoy({ headers: req.headers });

    let imageToBeUploaded = {};
    let imageFileName;

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
          const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
            config.storageBucket
          }/o/${imageFileName}?alt=media`;
          return db.doc(`/users/${req.user.userName}`).update({ imageUrl });
        })
        .then(() => {
          return res.json({ message: 'image uploaded successfully' });
        })
        .catch((err) => {
          console.error(err);
          return res.status(500).json({ error: 'something went wrong' });
        });
    });
    busboy.end(req.rawBody);
  };

//Upload Banner
  exports.uploadBanner = (req, res) => {
      const BusBoy = require('busboy');
      const path = require('path');
      const os = require('os');
      const fs = require('fs');

      const busboy = new BusBoy({ headers: req.headers });

      let imageToBeUploaded = {};
      let imageFileName;

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
            const bannerUrl = `https://firebasestorage.googleapis.com/v0/b/${
              config.storageBucket
            }/o/${imageFileName}?alt=media`;
            return db.doc(`/users/${req.user.userName}`).update({ bannerUrl });
          })
          .then(() => {
            return res.json({ message: 'image uploaded successfully' });
          })
          .catch((err) => {
            console.error(err);
            return res.status(500).json({ error: 'something went wrong' });
          });
      });
      busboy.end(req.rawBody);
    };

    exports.markNotificationsRead = (req, res) => {
      let batch = db.batch();
      req.body.forEach((notificationId) => {
        const notification = db.doc(`/notifications/${notificationId}`);
        batch.update(notification, { read: true });
      });
      batch
        .commit()
        .then(() => {
          return res.json({ message: "Notifications marked read" });
        })
        .catch((err) => {
          console.error(err);
          return res.status(500).json({ error: err.code });
        });
    };
