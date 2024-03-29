import express from 'express';
import cors from 'cors';
import validator from 'validator';
import log4js from 'log4js';
import {
  auth,
  firestore,
} from './firebase.js'; 
import {
  mongoDatabase,
} from './mongodb.js';
import {
  ObjectId,
} from 'mongodb';

const isDebug = (process.env.NODE_ENV !== 'production');

log4js.configure({
  appenders: {
    stdout: {
      type: 'stdout',
      layout: {
        type: 'pattern',
        pattern: isDebug ? (
          '%[[%d{ISO8601_WITH_TZ_OFFSET}] [%p]%] %m'
        ) : (
          '[%d{ISO8601_WITH_TZ_OFFSET}] [%p] %m'
        ),
      },
    },
    stderr: {
      type: 'stderr',
      layout: {
        type: 'pattern',
        pattern: isDebug ? (
          '%[[%d{ISO8601_WITH_TZ_OFFSET}] [%p]%] %m'
        ) : (
          '[%d{ISO8601_WITH_TZ_OFFSET}] [%p] %m'
        ),
      },
    },
    filteredStdout: {
      type: 'logLevelFilter',
      appender: 'stdout',
      level: isDebug ? 'trace' : 'info',
      maxLevel: 'warn',
    },
    filteredStderr: {
      type: 'logLevelFilter',
      appender: 'stderr',
      level: 'error',
    },
  },
  categories: {
    default: {
      appenders: [
        'filteredStdout',
        'filteredStderr',
      ],
      level: 'trace',
    },
  },
});
const logger = log4js.getLogger('default');

const app = express();
app.use(express.json());
app.use(cors());
app.use(
  log4js.connectLogger(
    log4js.getLogger('api_express')
  )
);

export const launch = () => {
  app.get('/', (req, res) => {
    return res.status(200).send('Hello from Express.js');
  });

  // Verify token
  const requireIdToken = (req, res) => {
    const [ authType, idToken ] = req.get('Authorization').split(' ');

    if(!authType === 'Bearer') {
      return res.status(401).send('Invalid type');
    }

    return auth.verifyIdToken(idToken, true).catch(err => {
      return res.status(401).send('Invalid token');
    });
  };
  
  // Test of Firebase Auth
  app.post('/api/debug-with-token', (req, res) => {
    return requireIdToken(req, res).then(decodedToken => {
      return res.status(200).send('Hello from Express.js with Firebase Auth Token!');
    });
  });
  

  // Target users
  //// Provide acceptable target users
  app.get('/api/acceptableTargetUsernames', (req, res) => {
    const targets = process.env.NOTIF_TARGETS.split(',');
    return res.status(200).send(targets);
  });

  // Endpoint
  //// Register
  app.post('/api/endpoints', (req, res) => {
    const now = new Date();

    const {
      usernames,
      label,
      dest,
      destDetails,
    } = req.body;

    if(
      (
        !Array.isArray(usernames)
        || usernames.some(val => typeof val !== 'string' || val === '')
      ) || (
        typeof label !== 'string'
        || label.trim() === ''
      ) || (
        typeof dest !== 'string'
      ) || (() => {
        switch(dest) {
          case 'discord-webhook': {
            const {
              url,
            } = destDetails;

            return !(
              validator.isURL(url, {
                require_protocol: true,
                require_valid_protocol: true,
                protocols: [
                  'http',
                  'https',
                ],
                require_host: true,
                require_port: false,
                allow_protocol_relative_urls: false,
                allow_fragments: true,
                allow_query_components: true,
                validate_length: true,
              })
              && url.startsWith('https://discord.com/api/webhooks/')
            );
          }
          case 'json': {
            const {
              method,
              url,
            } = destDetails;

            return !(
              [ 'POST', 'GET' ].includes(method)
              && (
                validator.isURL(url, {
                  require_protocol: true,
                  require_valid_protocol: true,
                  protocols: [
                    'http',
                    'https',
                  ],
                  require_host: true,
                  require_port: false,
                  allow_protocol_relative_urls: false,
                  allow_fragments: true,
                  allow_query_components: true,
                  validate_length: true,
                })
              )
            );
          }
          default:
            return true;
        }
      })() || (() => {
        const targets = process.env.NOTIF_TARGETS.split(',');
        return usernames.some(username => (
          !targets.includes(username)
        ));
      })()
    ) {
      return res.status(400).send('Bad request body');
    }

    return requireIdToken(req, res).then(decodedToken => {
      const {
        uid,
      } = decodedToken;

      logger.info(`Add endpoint / ${uid} ${label} ${dest} ${JSON.stringify(destDetails)}`);

      return mongoDatabase.collection('endpoints').insertOne({
        owner: uid,
        usernames,
        label,
        dest,
        destDetails,
        createdAt: now,
        updatedAt: now,
      }).then(result => {
        return res.status(200).send({
          data: {
            id: result.insertedId,
          },
        });
      }).catch(err => {
        logger.error(`Failed to add endpoint. / ${err.code} ${err.name} ${err.message}`);
        return res.status(500).send('Internal error occured');
      });
    });
  });

  //// List
  app.get('/api/endpoints', (req, res) => {
    return requireIdToken(req, res).then(decodedToken => {
      const {
        uid,
      } = decodedToken;

      logger.info(`Get endpoints / ${uid}`);

      return mongoDatabase.collection('endpoints').find({
        owner: uid,
      }).toArray().then(docs => {
        const rtnEndpoints = [];
        
        for(const doc of docs) {
          const endpoint = {
            id: doc._id,
            ...doc,
          };
          delete endpoint._id;
          rtnEndpoints.push(endpoint);
        }

        return res.status(200).send(rtnEndpoints);
      }).catch(err => {
        logger.error(`Failed to get endpoints of ${uid}. / ${err.code} ${err.name} ${err.message}`);
        return res.status(500).send('Internal error occured');
      });
    });
  });
  
  //// Update
  app.put('/api/endpoints/:id', (req, res) => {
    const now = new Date();

    const {
      id,
    } = req.params;

    const {
      usernames,
      label,
      dest,
      destDetails,
    } = req.body;

    if(
      (
        !Array.isArray(usernames)
        || usernames.some(val => typeof val !== 'string' || val === '')
      ) || (
        typeof label !== 'string'
        || label.trim() === ''
      ) || (
        typeof dest !== 'string'
      ) || (() => {
        switch(dest) {
          case 'discord-webhook': {
            const {
              url,
            } = destDetails;

            return !(
              validator.isURL(url, {
                require_protocol: true,
                require_valid_protocol: true,
                protocols: [
                  'http',
                  'https',
                ],
                require_host: true,
                require_port: false,
                allow_protocol_relative_urls: false,
                allow_fragments: true,
                allow_query_components: true,
                validate_length: true,
              })
              && url.startsWith('https://discord.com/api/webhooks/')
            );
          }
          case 'json': {
            const {
              method,
              url,
            } = destDetails;

            return !(
              [ 'POST', 'GET' ].includes(method)
              && (
                validator.isURL(url, {
                  require_protocol: true,
                  require_valid_protocol: true,
                  protocols: [
                    'http',
                    'https',
                  ],
                  require_host: true,
                  require_port: false,
                  allow_protocol_relative_urls: false,
                  allow_fragments: true,
                  allow_query_components: true,
                  validate_length: true,
                })
              )
            );
          }
          default:
            return true;
        }
      })() || (() => {
        const targets = process.env.NOTIF_TARGETS.split(',');
        return usernames.some(username => (
          !targets.includes(username)
        ));
      })()
    ) {
      return res.status(400).send('Bad request body');
    }

    return requireIdToken(req, res).then(decodedToken => {
      const {
        uid,
      } = decodedToken;

      logger.info(`Update endpoint ${id} / ${uid}`);
      return mongoDatabase.collection('endpoints').findOneAndUpdate(
        {
          _id: ObjectId(id),
          owner: uid,
        },
        {
          $set: {
            usernames,
            label,
            dest,
            destDetails,
            updatedAt: now,
          },
        }
      ).then(result => {
        const originalDoc = result.value;
        if(!originalDoc) {
          return res.status(404).send('Endpoint does not exist');
        }

        return res.status(200).send({
          id,
        });
      });
    }).catch(err => {
      logger.error(`Failed to update endpoint ${id}. / ${err.code} ${err.name} ${err.message}`);
      return res.status(500).send('Internal error occured');
    });
  });


  /// Remove
  app.delete('/api/endpoints/:id', (req, res) => {
    const {
      id,
    } = req.params;

    return requireIdToken(req, res).then(decodedToken => {
      const {
        uid,
      } = decodedToken;

      logger.info(`Delete endpoint ${id} / ${uid}`);
      return mongoDatabase.collection('endpoints').findOneAndDelete({
        _id: ObjectId(id),
        owner: uid,
      }).then(result => {
        const originalDoc = result.value;

        if(!originalDoc) {
          return res.status(404).send('Endpoint does not exist');
        }

        return res.status(200).send({
          id,
        });
      });
    }).catch(err => {
      logger.error(`Failed to delete endpoint ${id}. / ${err.code} ${err.name} ${err.message}`);
      return res.status(500).send('Internal error occured');
    });
  });
  

  // Listen
  app.listen(process.env.PORT || 80, () => {
    logger.info('REST API server started');
  });
};

