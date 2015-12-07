import {camelCase, isArray, get, set} from '../utils'

/**
 * Steps to apply a "hasMany" relationship
 * 1. Choose the localField and foreignKey or localKeys
 * 2. Configure property descriptor, possibly including custom getter/setter
 * 3. Add property to prototype of target Model
 *
 * The added property is where instances of the related Model will be
 * attached to an instance of the target Model, e.g. if User hasMany Comment
 * and "localField" is set to "comments", "user.comments" will be a reference to
 * the array of comments.
 */
function applyHasMany (Model, Relation, opts = {}) {
  // Choose field where the relation will be attached
  const localField = opts.localField || `${camelCase(Relation.name)}Collection`
  // Choose field on related instances that holds the primary key of instances
  // of the target Model
  let foreignKey = opts.foreignKey
  const localKeys = opts.localKeys
  const foreignKeys = opts.foreignKeys

  if (!foreignKey && !localKeys && !foreignKeys) {
    foreignKey = opts.foreignKey = `${camelCase(Model.name)}Id`
  }
  if (foreignKey) {
    Relation.data().createIndex(foreignKey)
  }

  // Setup configuration of the property
  const descriptor = {
    // Whether the field specified by "localField" will show up in "for...in"
    enumerable: opts.enumerable !== undefined ? !!opts.enumerable : false,
    // Set default method for retrieving the linked relation
    get () {
      const query = {}
      if (foreignKey) {
        // Make a FAST retrieval of the relation using a secondary index
        return Relation.getAll(get(this, Model.idAttribute), { index: foreignKey })
      } else if (localKeys) {
        const keys = get(this, localKeys) || []
        const args = isArray(keys) ? keys : Object.keys(keys)
        // Make a slower retrieval using the ids in the "localKeys" array
        return Relation.getAll.apply(Relation, args)
      } else if (foreignKeys) {
        set(query, `where.${foreignKeys}.contains`, get(this, Model.idAttribute))
        // Make a much slower retrieval
        return Relation.filter(query)
      }
      return undefined
    },
    // Set default method for setting the linked relation
    set (children) {
      if (children && children.length) {
        const id = get(this, Model.idAttribute)
        if (foreignKey) {
          children.forEach(function (child) {
            set(child, foreignKey, id)
          })
        } else if (localKeys) {
          const keys = []
          children.forEach(function (child) {
            keys.push(get(child, Relation.idAttribute))
          })
          set(this, localKeys, keys)
        } else if (foreignKeys) {
          children.forEach(function (child) {
            const keys = get(child, foreignKeys)
            if (keys) {
              if (keys.indexOf(id) === -1) {
                keys.push(id)
              }
            } else {
              set(child, foreignKeys, [id])
            }
          })
        }
      }
      return get(this, localField)
    }
  }

  // Check whether the relation shouldn't actually be linked via a getter
  if (opts.link === false || (opts.link === undefined && !Model.linkRelations)) {
    delete descriptor.get
    delete descriptor.set
    descriptor.writable = true
  }

  // Check for user-defined getter
  if (opts.get) {
    const originalGet = descriptor.get
    // Set user-defined getter
    descriptor.get = function () {
      // Call user-defined getter, passing in:
      //  - target Model
      //  - related Model
      //  - instance of target Model
      //  - the original getter function, in case the user wants to use it
      return opts.get(Model, Relation, this, originalGet ? (...args) => originalGet.apply(this, args) : undefined)
    }
  }

  // Check for user-defined setter
  if (opts.set) {
    const originalSet = descriptor.set
    // Set user-defined setter
    descriptor.set = function (children) {
      // Call user-defined getter, passing in:
      //  - target Model
      //  - related Model
      //  - instance of target Model
      //  - instances of related Model
      //  - the original setter function, in case the user wants to use it
      return opts.set(Model, Relation, this, children, originalSet ? (...args) => originalSet.apply(this, args) : undefined)
    }
  }

  // Finally, added property to prototype of target Model
  Object.defineProperty(Model.prototype, localField, descriptor)

  if (!Model.relationList) {
    Model.relationList = []
  }
  if (!Model.relationFields) {
    Model.relationFields = []
  }
  opts.type = 'hasMany'
  opts.name = Model.name
  opts.relation = Relation.name
  opts.Relation = Relation
  Model.relationList.push(opts)
  Model.relationFields.push(localField)

  // Return target Model for chaining
  return Model
}

/**
 * Usage:
 *
 * ES7 Usage:
 * import {hasMany, Model} from 'js-data'
 * class Post extends Model {}
 * @hasMany(Post, {...})
 * class User extends Model {}
 *
 * ES6 Usage:
 * import {hasMany, Model} from 'js-data'
 * class User extends Model {}
 * class Comment extends Model {}
 * hasMany(Comment, {...})(User)
 *
 * ES5 Usage:
 * var JSData = require('js-data')
 * var User = JSData.Model.extend()
 * var Comment = JSDataModel.extend()
 * JSData.hasMany(User, {...})(Comment)
 */
export function hasMany (Model, opts) {
  return function (target) {
    return applyHasMany(target, Model, opts)
  }
}
