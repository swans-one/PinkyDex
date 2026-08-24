export class Database {
  constructor(dbName, migrations, versionChangeHandler) {
    versionChangeHandler = versionChangeHandler || (db => {
      console.log("change requested, closing handle");
      db.close();
    })
    const versions = Object.keys(migrations).map(Number).toSorted(sortNumeric);
    if (versions.length < 1) {
      throw new Error("At least one numbered migration must be provided");
    }

    const lowest = versions[0];
    const highest = versions.at(-1);

    this.dbPromise = dbOpenPromise(
      window.indexedDB.open(dbName, highest),
      (ev) => {
        const db = ev.target.result;

        const sliceStart = ev.oldVersion === 0 ? 0 : versions.indexOf(ev.oldVersion) + 1;
        const sliceEnd = versions.indexOf(ev.newVersion) + 1
        const versionSlice = versions.slice(sliceStart, sliceEnd);

        for (const v of versionSlice) {
          migrations[v](db);
        }
      },
      versionChangeHandler,
    );
  }

  /** Alternate constructor, wrap an existing db, e.g. in a migration
  */
  static wrap(nativeDb) {
    const instance = Object.create(this.prototype);
    instance.dbPromise = new Promise((res, rej) => res(nativeDb));
    return instance;
  }

  /**
     @returns {Store} a store object for the named store
   */
  store(storeName) {
    return new Store(this.dbPromise, storeName);
  }

  /**
     @returns {Transaction} Open a transaction that can access
     multiple stores, or in other modes.
   */
  transaction(storeNames, mode) {
    return new Transaction(this.dbPromise, storeNames, mode);
  }

  /** Return all object stores and indexes in a nicely formatted
     object

     @returns {Promise<Object>}
   */
  async schema() {
    const fullSchema = {};
    for (const storeName of await this.storeNames()) {
      const store = this.store(storeName);

      const indexes = [];
      for (const indexName of await store.indexNames()) {
        const idx = await store.index(indexName).toNative();
        indexes.push({
          name: idx.name,
          keyPath: idx.keyPath,
          unique: idx.unique,
          multiEntry: idx.multiEntry,
        });
      }

      fullSchema[storeName] = {
        keyPath: (await store.toNative()).keyPath,
        autoIncrement: (await store.toNative()).autoIncrement,
        recordCount: await store.count(),
        indexes: indexes,
      };
    }
    return fullSchema;
  }

  /**
     @returns {Promise<IDBDatabase>} The underlying IDB database object
   */
  async toNative() {
    return await this.dbPromise;
  }

  // Pass through methods

  async version() {
    return (await this.dbPromise).version;
  }
  async name() {
    return (await this.dbPromise).name;
  }
  async storeNames() {
    return Array.from((await this.dbPromise).objectStoreNames);
  }
}

export class Store {
  constructor(dbPromise, name) {
    this.storePromise = dbPromise.then((db) => {
      return db.transaction([name], 'readwrite').objectStore(name);
    });
  }

  static wrap(nativeStore) {
    const instance = Object.create(this.prototype);
    instance.storePromise = new Promise((res, rej) => res(nativeStore));
    return instance;
  }

  static fromTransaction(transactionPromise, storeName) {
    const instance = Object.create(this.prototype);
    instance.storePromise = transactionPromise.then((tran) => {
      return tran.objectStore(storeName);
    });
    return instance;
  }

  /**
     @returns {Cursor} A Cursor object for making queries
   */
  cursor(query, direction) {
    return new Cursor(this.storePromise, query, direction);
  }

  /**
     @returns {Index} An Index object for more refined queries
   */
  index(name) {
    return new Index(this.storePromise, name)
  }

  /**
     @returns {IDBObjectStore} the underlying IDBObjectStore object.
   */
  async toNative() {
    return await this.storePromise;
  }

  /**
     @returns {String[]} A list of index names
   */
  async indexNames() {
    return Array.from((await this.storePromise).indexNames);
  }

  /**
     @returns {Promise<number>} A promise for the key of the added object
   */
  async add(value, key) {
    const store = await this.storePromise;
    const request = store.add(value, key);
    return await responsePromise(request);
  }

  /**
     @returns {Promise<number>} A promise for the key of the added object
   */
  async put(value, key) {
    const request = (await this.storePromise).put(value, key);
    return await responsePromise(request);
  }

  /**
     @returns {Promise<Object>} A promise for the requested object
   */
  async get(key) {
    const request = (await this.storePromise).get(key);
    return await responsePromise(request);
  }

  /**
     @returns {Number} Number of records in the store
   */
  async count(query) {
    const request = (await this.storePromise).count(query);
    return await responsePromise(request);
  }

  /** Clear all records in the store
   */
  async clear() {
    await (await this.storePromise).clear();
  }

  /** @returns {Promise<IDBTransaction>} The underlying transaction
     for this object */
  async transaction() {
    return (await this.storePromise).transaction;
  }

}

// The value of an index is a key in the containing object store
export class Index {
  constructor(storePromise, name) {
    this.indexPromise = storePromise.then((store) => store.index(name));
    this._name = name;
  }

  static wrap(nativeIndex) {
    const instance = Object.create(this.prototype);
    instance.indexPromise = new Promise((res, rej) => res(nativeIndex));
    return instance;
  }

  async keyPath() {
    return (await this.indexPromise).keyPath;
  }

  async multiEntry() {
    return (await this.indexPromise).multiEntry;
  }

  async name() {
    return (await this.indexPromise).name;
  }

  async unique() {
    return (await this.indexPromise).unique;
  }

  async toNative() {
    return await this.indexPromise;
  }

  cursor(query, direction) {
    return new Cursor(this.indexPromise, query, direction);
  }

}

export class Cursor {
  constructor(sourcePromise, query, direction) {
    this.sourcePromise = sourcePromise;
    this.query = query;
    this.direction = direction;
    this.filters = [];
    this.mappers = [];
  }

  /** Only collect values that pass the filter function.

     All where functions are performed before any transform functions.

     @param (function) A function that takes an object of the form
     `{key: ..., value: ...}` and returns a boolean if the value
     should be included. */
  where(fn) {
    this.filters.push(fn);
    return this;
  }

  /** Transform objects before collecting / aggregating them.

     Transform functions will only be run on values that pass the
     `.where` function filters. */
  transform(fn) {
    this.mappers.push(fn);
    return this;
  }

  /** Generic collect function.
     - Opens a new IDBCursor object
     - Walks the whole cursor
     - Filters based on functions provided from .where
     - Maps values based on functions provided from .transform
     - Collects results into an accumulator with a reduceFn
   */
  async _collect(reduceFn, accumulator) {
    const source = await this.sourcePromise;

    return new Promise((resolve, reject) => {
      const request = source.openCursor(this.query, this.direction);

      request.onsuccess = (ev) => {
        const cursor = ev.target.result;
        if (cursor) {
          let obj = {key: cursor.key, value: cursor.value};
          let passesWhere = this.filters.reduce(
            (acc, whereFn) => acc && whereFn(obj), true
          );
          if (passesWhere) {
            let transformedObj = this.mappers.reduce(
              (obj, fn) => fn(obj), obj
            );
            accumulator = reduceFn(accumulator, transformedObj, cursor);
          }
          cursor.continue();
        } else {
          resolve(accumulator)
        }
      }
      request.onerror = (ev) => {
        reject(`Cursor Error: ${ev.target.error}`)
      }
    })
  }

  /** Collect results into an array
   */
  async collect() {
    return await this._collect((acc, obj) => {
      acc.push(obj);
      return acc;
    }, []);
  }

  /** Collect results into an arbitrary value using a reducer
     function.
   */
  async collectReduce(reduceFn, acc) {
    // Don't pass the cursor as part of the api
    const fn = (acc, obj, _cursor) => reduceFn(acc, obj);
    return await this._collect(fn, acc);
  }

  /** Collect into an object mapping keys to arrays, according to the
     output of groupByFn
   */
  async collectGroup(groupByFn) {
    const reducer = (acc, record) => {
      const key = groupByFn(record);
      if (acc.hasOwnProperty(key)) {
        acc[key].push(record);
      } else {
        acc[key] = [record];
      }
      return acc;
    }
    return await this._collect(reducer, {});
  }

  /** Deletes all items in the cursor after applying any `.where`
     filter functions.

     @returns {Array<Promise<undefined>>} An array of promises that
     resolve as `undefined` if the delete was completed successfully
   */
  async performDrop() {
    const doDrop = (acc, obj, cursor) => {
      const promise = responsePromise(cursor.delete());
      acc.push(promise);
      return acc;
    }
    return await this._collect(doDrop, []);
  }

  /** Updates all items in the cursor using the provided `updateFn`
     after applying any `.where` filter functions. Note that using
     `.transform` functions will be run before the data in passed to
     the updateFn, but take care not to leave the data unusable. It is
     likely safer to encode transforms into the `updateFn` itself.

     @param {function} updateFn A function taking arguments in the
     form ({key, value}) that should return the new value to store at
     this key.

     @returns {Array<Promise<key>>} An array of promises for the
     update requests. Can be awaited with Promise.all().  */
  async performUpdate(updateFn) {
    const doUpdate = (acc, obj, cursor) => {
      const promise = responsePromise(cursor.update(updateFn(obj)));
      acc.push(promise);
      return acc;
    }
    return await this._collect(doUpdate, [])
  }
}

export class Transaction {
  constructor(dbPromise, storeNames, mode) {
    this.transactionPromise = dbPromise.then((db) => {
      return db.transaction(storeNames, mode)
    });
    this.storeNames = storeNames;
    this.mode = mode;
  }

  store(storeName) {
    return Store.fromTransaction(this.transactionPromise, storeName);
  }

  async toNative() {
    return await this.transactionPromise;
  }

  async abort() {
    return (await this.transactionPromise).abort();
  }

  async commit() {
    return (await this.transactionPromise).commit();
  }
}


// IDB Utilities

export function dbOpenPromise(request, onUpgradeNeeded, onVersionChange) {
  if (typeof(onUpgradeNeeded) !== "function") {
    throw new Error("Must provide an onupgradeneeded handler");
  }
  if (typeof(onVersionChange) !== "function") {
    throw new Error("Must provide an onversionchange handler");
  }

  return new Promise((resolve, reject) => {
    request.onsuccess = (ev) => {
      const db = ev.target.result;

      // See:
      // https://www.w3.org/TR/IndexedDB/#handling-versionchange
      //
      // Without doing something here, deletes & version changes can
      // hang indefinitely (often until a page refresh).
      db.onversionchange = () => onVersionChange(db);

      resolve(db);
    }

    request.onerror = (ev) => {
      const msg = `IDB Error: ${ev.target.error}`;
      reject(msg);
    }

    request.onupgradeneeded = (ev) => {
      if (onUpgradeNeeded === undefined) {
        reject('IDB Upgrade failed. No upgrade function provided.');
        throw new Error('IDB Upgrade failed. No upgrade function provided.');
      }
      onUpgradeNeeded(ev);
    }

    request.onBlocked = (ev) => {
      const msg = (
        `IDB Upgrade Blocked. `
        + `Tried v[${ev.target.oldVersion}] -> v[${ev.target.newVersion}].`
      )
      reject(msg);
    }
  })
}

export function responsePromise(request, onSuccess, onError) {
  onSuccess = onSuccess || (ev => ev.target.result);
  onError = onError || (ev => `IDB ${ev.target.error}`);

  return new Promise((resolve, reject) => {
    request.onsuccess = (ev) => resolve(onSuccess(ev));
    request.onerror = (ev) => reject(onError(ev));
  })
}


// Generic Utilities

function sortNumeric(a, b) { return a - b; }
