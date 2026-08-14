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

  /**
     @returns {Store} a store object for the named store
   */
  store(storeName) {
    return new Store(this.dbPromise, storeName);
  }

  /** Return all object stores and indexes in a nicely formatted
     object

     @returns {Promise<Object>}
   */
  async schema() {
    // TODO implement this
    return {};
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
    return (await this.dbPromise).objectStoreNames;
  }
}

export class Store {
  constructor(dbPromise, name) {
    this.storePromise = dbPromise.then((db) => {
      return db.transaction([name], 'readwrite').objectStore(name);
    });
  }

  index(name) {

  }

  cursor(query, direction) {
    return new Cursor(this.storePromise, query, direction);
  }

  async toNative() {
    return await this.storePromise;
  }

  /**
     @returns {Promise<number>} A promise for the key of the added object
   */
  async add(value, key) {
    const store = await this.storePromise;
    const request = store.add(value);
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

  /** Clear all records in the store
   */
  async clear() {

  }

  // Pass through methods

  /** @returns {Promise<IDBTransaction>} The underlying transaction
     for this object */
  async transaction() {

  }

}

// The value of an index is a key in the containing object store
class Index {
  constructor(Store) {

  }

  cursor() {

  }

}

class Cursor {
  constructor(sourcePromise, query, direction) {
    this.sourcePromise = sourcePromise;
    this.range = undefined;
    this.filters = [];
    this.mappers = [];
  }

  /** Only collect values that

     @param (function) A function that takes an object of the form
     (`{key: ..., value: ...}`) */
  where(fn) {
    this.filters.push(fn)
  }

  transform() {

  }

  /** Collect results of the cursor with any applied filters or
     mappers into an array of results.
   */
  async collect() {
    const accumulator = [];
    const source = await this.sourcePromise;

    return new Promise((resolve, reject) => {
      const request = source.openCursor(this.range);
      request.onsuccess = (ev) => {
        const cursor = ev.target.result;
        if (cursor) {
          accumulator.push({key: cursor.key, value: cursor.value});
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

  async reduceCollect(opFn, acc) {
  }

  async groupCollect(groupByFn, opFn, acc) {
  }

  /** Deletes all items in the cursor after applying any `.where`
     filter functions.
   */
  async doDrop() {

  }

  /** Updates all items in the cursor using the provided `updateFn`
  after applying any `.where` filter functions.*/
  async doUpdate(updateFn) {

  }
}




function migrate() {}


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

      // https://www.w3.org/TR/IndexedDB/#handling-versionchange
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
  onError = onError || (ev => `IDB Error: ${ev.target.error}`);

  return new Promise((resolve, reject) => {
    request.onsuccess = (ev) => resolve(onSuccess(ev));
    request.onError = (ev) => reject(onError(ev));
  })
}

// Generic Utilities

function sortNumeric(a, b) { return a - b; }
