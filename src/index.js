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

  async toNative() {
    return await this.dbPromise;
  }

  store(storeName) {
    return Store(this.dbPromise, storeName);
  }
}

class Store {
  constructor(dbPromise, name) {

  }
}

class Index {
  constructor(Store) {

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
