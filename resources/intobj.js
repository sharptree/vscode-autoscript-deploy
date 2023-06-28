/* eslint-disable indent */
/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

// @ts-nocheck
MboConstants = Java.type('psdi.mbo.MboConstants');
SqlFormat = Java.type('psdi.mbo.SqlFormat');
MXServer = Java.type('psdi.server.MXServer');

System = Java.type('java.lang.System');

// Array find polyfill.
if (typeof Array.prototype.find != 'function') {
    Array.prototype.find = function (callback) {
        if (this === null) {
            throw new TypeError('Array.prototype.find called on null or undefined');
        } else if (typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }
        var list = Object(this);
        // Makes sure is always has an positive integer as length.
        var length = list.length >>> 0;
        var thisArg = arguments[1];
        for (var i = 0; i < length; i++) {
            var element = list[i];
            if (callback.call(thisArg, element, i, list)) {
                return element;
            }
        }
    };
}

//TODO - Add handling for sigoptions, including removing any existing sigoptions before deleting the mbo and then adding them back afterwards if possible.
// add after the use os app security.


function IntegrationObject(intObject) {

    if (!intObject) {
        throw new Error('A integration object JSON is required to create the IntegrationObject object.');
    } else if (typeof intObject.intObjectName === 'undefined') {
        throw new Error('The intObjectName property is required and must a Maximo Integration Object field value.');
    } else if (typeof intObject.maxIntObjDetails === 'undefined' || !Array.isArray(intObject.maxIntObjDetails) || intObject.maxIntObjDetails.length == 0) {
        throw new Error('The maxIntObjDetails property is required and must an array that contains at least one Maximo Integration Object Detail object.');
    }

    this.intObjectName = intObject.intObjectName;
    this.description = typeof intObject.description === 'undefined' ? '' : intObject.description;
    this.useWith = typeof intObject.useWith === 'undefined' || !intObject.useWith ? 'INTEGRATION' : intObject.useWith;
    this.defClass = typeof intObject.defClass === 'undefined' ? '' : intObject.defClass;
    this.procClass = typeof intObject.procClass === 'undefined' ? '' : intObject.procClass;
    this.searchAttrs = typeof intObject.searchAttrs === 'undefined' ? '' : intObject.searchAttrs;
    this.restrictWhere = typeof intObject.restrictWhere === 'undefined' ? '' : intObject.restrictWhere;
    this.module = typeof intObject.module === 'undefined' ? '' : intObject.module;
    this.selfReferencing = typeof intObject.selfReferencing === 'undefined' ? false : intObject.selfReferencing == true;
    this.flatSupported = typeof intObject.flatSupported === 'undefined' ? false : intObject.flatSupported == true;
    this.queryOnly = typeof intObject.queryOnly === 'undefined' ? false : intObject.queryOnly == true;
    this.loadQueryFromApp = typeof intObject.loadQueryFromApp === 'undefined' ? false : intObject.loadQueryFromApp == true;
    this.useOSSecurity = typeof intObject.useOSSecurity === 'undefined' ? false : intObject.useOSSecurity == true;
    this.authApp = typeof intObject.authApp === 'undefined' ? '' : intObject.authApp;


    if (intObject.maxIntObjDetails.find(function (maxIntObjDetail) { return typeof maxIntObjDetail.objectName === 'undefined' || !maxIntObjDetail.objectName; })) {
        throw new Error('The integration object ' + this.intObjectName + ' contains a object detail record that does not contain an object name.');
    }

    if (intObject.maxIntObjDetails.find(function (maxIntObjDetail) { return typeof maxIntObjDetail.parentObjName !== 'undefined' && maxIntObjDetail.parentObjName && (typeof maxIntObjDetail.relation === 'undefined' || !maxIntObjDetail.relation); })) {
        throw new Error('The integration object ' + this.intObjectName + ' contains a child object detail record that does not contain a relation name.');
    }

    var parents = intObject.maxIntObjDetails.filter(function (maxIntObjDetail) {
        return typeof maxIntObjDetail.parentObjName === 'undefined' || !maxIntObjDetail.parentObjName;
    });

    if (parents.length == 0) {
        throw new Error('The integration object ' + this.intObjectName + ' does not have a top level object detail record, a top level parent must be defined for an integration object.');
    }

    if (parents.length > 1) {
        throw new Error('The integration object ' + this.intObjectName + ' has more than one top level object detail record, only one top level parent can be defined for an integration object.');
    }

    intObject.maxIntObjDetails.forEach(function (maxIntObjDetail) {
        if (typeof maxIntObjDetail.maxIntObjCols !== 'undefined' && Array.isArray(maxIntObjDetail.maxIntObjCols)) {
            maxIntObjDetail.maxIntObjCols.forEach(function (obj) {
                if (typeof obj.name === 'undefined' || !obj.name) {
                    throw new Error('The integration object ' + intObject.intObjectName + ' object ' + maxIntObjDetail.objectName + ' is missing a name property for a maxIntObjCols object.');
                }
                if (typeof obj.intObjFldType === 'undefined' || !obj.intObjFldType) {
                    throw new Error('The integration object ' + intObject.intObjectName + ' object ' + maxIntObjDetail.objectName + ' is missing a intObjFldType property for a maxIntObjCols object.');
                }
            });
        } else {
            maxIntObjDetail.maxIntObjCols = [];
        }

        if (typeof maxIntObjDetail.maxIntObjAlias !== 'undefined' && Array.isArray(maxIntObjDetail.maxIntObjAlias)) {

            if (!intObject.flatSupported) {
                throw new Error('The maxIntObjAlias entries can only be applied to integration objects that support flat structure, ' + intObject.objectName + ' does not support flat structure.');
            }

            maxIntObjDetail.maxIntObjAlias.forEach(function (obj) {
                if (typeof obj.name === 'undefined' || !obj.name) {
                    throw new Error('The integration object ' + intObject.intObjectName + ' object ' + maxIntObjDetail.objectName + ' is missing a name property for a maxIntObjAlias object.');
                }
                if (typeof obj.aliasName === 'undefined' || !obj.aliasName) {
                    throw new Error('The integration object ' + intObject.intObjectName + ' object ' + maxIntObjDetail.objectName + ' is missing a aliasName property for a maxIntObjAlias object.');
                }
            });
        } else {
            maxIntObjDetail.maxIntObjAlias = [];
        }

        if (typeof maxIntObjDetail.objectAppAuth !== 'undefined' && Array.isArray(maxIntObjDetail.objectAppAuth)) {
            maxIntObjDetail.objectAppAuth.forEach(function (obj) {
                if (typeof obj.context === 'undefined' || !obj.context) {
                    throw new Error('The integration object ' + intObject.intObjectName + ' object ' + maxIntObjDetail.objectName + ' is missing a context property for a objectAppAuth object.');
                }
            });
        } else {
            maxIntObjDetail.objectAppAuth = [];
        }

        maxIntObjDetail.skipKeyUpdate = typeof maxIntObjDetail.skipKeyUpdate === 'undefined' ? false : maxIntObjDetail.skipKeyUpdate == true;
        maxIntObjDetail.excludeParentKey = typeof maxIntObjDetail.excludeParentKey === 'undefined' ? false : maxIntObjDetail.excludeParentKey == true;
        maxIntObjDetail.deleteOnCreate = typeof maxIntObjDetail.deleteOnCreate === 'undefined' ? false : maxIntObjDetail.deleteOnCreate == true;
        maxIntObjDetail.propagateEvent = typeof maxIntObjDetail.propagateEvent === 'undefined' ? false : maxIntObjDetail.propagateEvent == true;
        maxIntObjDetail.invokeExecute = typeof maxIntObjDetail.invokeExecute === 'undefined' ? false : maxIntObjDetail.invokeExecute == true;
        maxIntObjDetail.fdResource = typeof maxIntObjDetail.fdResource === 'undefined' ? '' : maxIntObjDetail.fdResource;

    });

    intObject.maxIntObjDetails.sort(function (a, b) {
        if (typeof a.parentObjName === 'undefined' || !a.parentObjName) {
            return -1;
        } else if (typeof b.parentObjName === 'undefined' || !b.parentObjName) {
            return 1;
        } else if (a.objectName == b.parentObjName) {
            return -1;
        } else if (b.objectName == a.parentObjName) {
            return 1;
        } else {
            return 0;
        }
    });

    this.maxIntObjDetails = intObject.maxIntObjDetails;

    this.maxIntObjDetails.forEach(function (obj) {
        obj.parentObjName = typeof obj.parentObjName === 'undefined' ? '' : obj.parentObjName;
        obj.relation = typeof obj.relation === 'undefined' ? '' : obj.relation;
        obj.altKey = typeof obj.altKey === 'undefined' ? '' : obj.altKey;
        obj.objectOrder = typeof obj.objectOrder === 'undefined' ? 1 : obj.objectOrder;
        obj.excludeByDefault = typeof obj.excludeByDefault === 'undefined' ? false : obj.excludeByDefault == true;
    });

    if (typeof intObject.objectAppAuth !== 'undefined' && intObject.objectAppAuth && Array.isArray(intObject.objectAppAuth)) {
        intObject.objectAppAuth.forEach(function (obj) {
            if (typeof obj.context === 'undefined' || !obj.context) {
                throw new Error('An objectAppAuth entry is missing the required context property.');
            } else if (typeof obj.objectName === 'undefined' || !obj.objectName) {
                throw new Error('An objectAppAuth entry is missing the required objectName property.');
            } else if (typeof obj.authApp === 'undefined' || !obj.authApp) {
                throw new Error('An objectAppAuth entry is missing the required authApp property.');
            }
            obj.description = typeof obj.description == 'undefined' ? '' : obj.description;
        });
        this.objectAppAuth = intObject.objectAppAuth;
    } else {
        this.objectAppAuth = [];
    }

    if (typeof intObject.sigOption !== 'undefined' && intObject.sigOption && Array.isArray(intObject.sigOption)) {
        intObject.sigOption.forEach(function (option) {
            if (typeof option.optionName === 'undefined' || !option.optionName) {
                throw new Error('A sigOption entry is missing the required optionName property.');
            }
            option.description = typeof option.description === 'undefined' ? '' : option.description;
            option.alsoGrants = typeof option.alsoGrants === 'undefined' ? '' : option.alsoGrants;
            option.alsoRevokes = typeof option.alsoRevokes === 'undefined' ? '' : option.alsoRevokes;
            option.prerequisite = typeof option.prerequisite === 'undefined' ? '' : option.prerequisite;
            option.esigEnabled = typeof option.esigEnabled === 'undefined' ? false : option.esigEnabled == true;
            option.visible = typeof option.visible === 'undefined' ? true : option.visible == true;
        });

        this.sigOption = intObject.sigOption;

    } else {
        this.sigOption = [];
    }

    if (typeof intObject.osOSLCAction !== 'undefined' && intObject.osOSLCAction && Array.isArray(intObject.osOSLCAction)) {
        intObject.osOSLCAction.forEach(function (action) {
            if (typeof action.name === 'undefined' || !action.name) {
                throw new Error('A osOSLCAction entry is missing the required name property.');
            }

            if (typeof action.implType === 'undefined' || !action.implType) {
                throw new Error('An osOSLCAction entry is missing the required implType property.');
            } else {
                action.implType = action.implType.toLowerCase();
            }

            var implTypes = ['script', 'system', 'workflow', 'wsmethod'];

            if (implTypes.indexOf(action.implType) < 0) {
                throw new Error('The osOSLCAction implementation type ' + action.implType + ' is not valid, ' + implTypes.join(',') + ' are the valid implementation types.');
            }

            if (action.implType == 'script') {
                if (typeof action.scriptName === 'undefined' || !action.scriptName) {
                    throw new Error('The osOSLCAction entry is missing the required scriptName property for the implementation type of "script".');
                }
            } else if (action.implType == 'system') {
                if (typeof action.systemName === 'undefined' || !action.systemName) {
                    throw new Error('The osOSLCAction entry is missing the required systemName property for the implementation type of "system".');
                }
            } else if (action.implType == 'workflow') {
                if (typeof action.processName === 'undefined' || !action.processName) {
                    throw new Error('The osOSLCAction entry is missing the required processName property for the implementation type of "workflow".');
                }
            } else if (action.implType == 'wsmethod') {
                if (typeof action.methodName === 'undefined' || !action.methodName) {
                    throw new Error('The osOSLCAction entry is missing the required methodName property for the implementation type of "wsmethod".');
                }
            }

            action.description = typeof action.description === 'undefined' ? '' : action.description;
            action.optionName = typeof action.optionName === 'undefined' ? '' : action.optionName;
            action.collection = typeof action.collection === 'undefined' ? false : action.collection == true;
        });
        this.osOSLCAction = intObject.osOSLCAction;
    } else {
        this.osOSLCAction = [];
    }

    if (typeof intObject.oslcQuery !== 'undefined' && intObject.oslcQuery && Array.isArray(intObject.oslcQuery)) {
        intObject.oslcQuery.forEach(function (query) {
            if (typeof query.queryType === 'undefined' || !query.queryType) {
                throw new Error('A oslcQuery entry is missing the required queryType property.');
            } else {
                query.queryType = query.queryType.toLowerCase();
            }

            var queryTypes = ['appclause', 'method', 'osclause', 'script'];

            if (queryTypes.indexOf(query.queryType) < 0) {
                throw new Error('The oslcQuery query type ' + query.queryType + ' is not valid, ' + queryTypes.join(',') + ' are the valid query types.');
            }

            if (query.queryType == 'appclause') {
                if (typeof action.app === 'undefined' || !action.app) {
                    throw new Error('The oslcQuery entry is missing the required app property for the query type of "appclause".');
                }
                if (typeof action.clauseName === 'undefined' || !action.clauseName) {
                    throw new Error('The oslcQuery entry is missing the required clauseName property for the query type of "appclause".');
                }
            } else if (query.queryType == 'method') {
                if (typeof action.method === 'undefined' || !action.method) {
                    throw new Error('The oslcQuery entry is missing the required method property for the query type of "method".');
                }
                query.description = typeof query.description === 'undefined' ? '' : query.description;
            } else if (query.queryType == 'osclause') {
                if (typeof query.clauseName === 'undefined' || !query.clauseName) {
                    throw new Error('The oslcQuery entry is missing the required clauseName property for the query type of "osclause".');
                }
                if (typeof query.clause === 'undefined' || !query.clause) {
                    throw new Error('The oslcQuery entry is missing the required clause property for the query type of "osclause".');
                }
                query.description = typeof query.description === 'undefined' ? '' : query.description;
                query.isPublic = typeof query.isPublic === 'undefined' ? true : query.isPublic == true;
            } else if (query.queryType == 'script') {
                if (typeof action.scriptName === 'undefined' || !query.scriptName) {
                    throw new Error('The oslcQuery entry is missing the required scriptName property for the query type of "script".');
                }                
            }
        });
        this.oslcQuery = intObject.oslcQuery;

    } else {
        this.oslcQuery = [];
    }
}

IntegrationObject.prototype.constructor = IntegrationObject;
IntegrationObject.prototype.setMboValues = function (mbo) {
    if (!mbo) {
        throw new Error('A Mbo is required to set values from the Message object.');
    } else if (!(mbo instanceof Java.type('psdi.mbo.Mbo'))) {
        throw new Error('The mbo parameter must be an instance of psdi.mbo.Mbo.');
    } else if (!mbo.isBasedOn('MAXINTOBJECT')) {
        throw new Error('The mbo parameter must be based on the MAXINTOBJECT Maximo object.');
    }

    if (mbo.toBeAdded()) {
        mbo.setValue('INTOBJECTNAME', this.intObjectName);
    }

    mbo.setValue('DESCRIPTION', this.description);
    mbo.setValue('USEWITH', this.useWith);
    mbo.setValue('QUERYONLY', this.queryOnly);
    mbo.setValue('FLATSUPPORTED', this.flatSupported);
    mbo.setValue('LOADQUERYFROMAPP', this.loadQueryFromApp);
    mbo.setValue('DEFCLASS', this.defClass);
    mbo.setValue('PROCCLASS', this.procClass);
    mbo.setValue('SEARCHATTRS', this.searchAttrs);
    mbo.setValue('RESTRICTWHERE', this.restrictWhere);
    mbo.setValue('MODULE', this.module);

    var maxIntObjDetailSet = mbo.getMboSet('MAXINTOBJDETAIL');
    this.maxIntObjDetails.forEach(function (obj) {
        var maxIntObjDetail = maxIntObjDetailSet.add();
        maxIntObjDetail.setValue('OBJECTNAME', obj.objectName);
        maxIntObjDetail.setValue('ALTKEY', obj.altKey);
        maxIntObjDetail.setValue('EXCLUDEBYDEFAULT', obj.excludeByDefault);

        maxIntObjDetail.setValue('SKIPKEYUPDATE', obj.skipKeyUpdate);
        maxIntObjDetail.setValue('EXCLUDEPARENTKEY', obj.excludeParentKey);
        maxIntObjDetail.setValue('DELETEONCREATE', obj.deleteOnCreate);
        maxIntObjDetail.setValue('PROPAGATEEVENT', obj.propagateEvent);
        maxIntObjDetail.setValue('INVOKEEXECUTE', obj.invokeExecute);
        maxIntObjDetail.setValue('FDRESOURCE', obj.fdResource);

        if (obj.parentObjName) {
            maxIntObjDetail.setValue('PARENTOBJNAME', obj.parentObjName);
            maxIntObjDetail.setValue('RELATION', obj.relation);
            maxIntObjDetail.setValue('OBJECTORDER', obj.objectOrder);
        }

        var maxIntObjColsSet = maxIntObjDetail.getMboSet('MAXINTOBJCOLS');

        obj.maxIntObjCols.forEach(function (maxIntObjCol) {
            var maxIntObjCols = maxIntObjColsSet.add();
            maxIntObjCols.setValue('NAME', maxIntObjCol.name);
            maxIntObjCols.setValue('INTOBJFLDTYPE', maxIntObjCol.intObjFldType);
        });

        var maxIntObjAliasSet = maxIntObjDetail.getMboSet('MAXINTOBJALIAS');

        obj.maxIntObjAlias.forEach(function (maxIntObjAliasObj) {
            var maxIntObjAlias = maxIntObjAliasSet.add();
            maxIntObjAlias.setValue('NAME', maxIntObjAliasObj.name);
            maxIntObjAlias.setValue('ALIASNAME', maxIntObjAliasObj.aliasName);
        });


        var objectAppAuthSet = maxIntObjDetail.getMboSet('$objectappauth', 'OBJECTAPPAUTH', '1=1');

        obj.objectAppAuth.forEach(function (objAppAuth) {
            objectAppAuth = objectAppAuthSet.add();
            objectAppAuth.setValue('CONTEXT', objAppAuth.context);
            objectAppAuth.setValue('DESCRIPTION', objAppAuth.description);
            objectAppAuth.setValue('OBJECTNAME', obj.objectName);
            objectAppAuth.setValue('AUTHAPP', objAppAuth.authApp);
        });

    });

    if (!this.useOSSecurity && this.authApp) {
        mbo.setValue('AUTHAPP', this.authApp);
    } else if (this.useOSSecurity) {
        mbo.setValue('USEOSSECURITY', this.useOSSecurity);
    }
    var sigOptionSet = mbo.getMboSet('SIGOPTION');
    this.sigOption.forEach(function (option) {
        var sigOption = sigOptionSet.add();
        sigOption.setValue('OPTIONNAME', option.optionName);
        sigOption.setValue('DESCRIPTION', option.description);
        sigOption.setValue('ALSOGRANTS', option.alsoGrants);
        sigOption.setValue('ALSOREVOKES', option.alsoRevokes);
        sigOption.setValue('PREREQUISITE', option.prerequisite);
        sigOption.setValue('ESIGENABLED', option.esigEnabled);
        sigOption.setValue('VISIBLE', option.visible);
    });

    var osOSLCActionSet = mbo.getMboSet('OSOSLCACTION');

    var checkSigOptions = this.sigOption;
    this.osOSLCAction.forEach(function (action) {
        var osOSLCAction = osOSLCActionSet.add();
        osOSLCAction.setValue('NAME', action.name);
        osOSLCAction.setValue('DESCRIPTION', action.description);
        osOSLCAction.setValue('IMPLTYPE', action.implType);
        switch (action.implType) {
            case 'system':
                osOSLCAction.setValue('SYSTEMNAME', action.systemName);
                break;
            case 'script':
                osOSLCAction.setValue('SCRIPTNAME', action.scriptName);
                break;
            case 'workflow':
                osOSLCAction.setValue('PROCESSNAME', action.processName);
                break;
            case 'wsmethod':
                osOSLCAction.setValue('METHODNAME', action.methodName);
                break;
        }
        if (action.optionName) {
            if (checkSigOptions.find(function (option) { return option.optionName === action.optionName; })) {
                osOSLCAction.setValue('OPTIONNAME', action.optionName, MboConstants.NOVALIDATION);
            } else {
                osOSLCAction.setValue('OPTIONNAME', action.optionName);
            }
        }
        osOSLCAction.setValue('COLLECTION', action.collection);
    });

    var oslcQuerySet = mbo.getMboSet('OSLCQUERY');

    
    this.oslcQuery.forEach(function (query) {
        var oslcQuery = oslcQuerySet.add();
        oslcQuery.setValue('QUERYTYPE', query.queryType);
        switch (query.queryType) {            
            case 'appclause':
                oslcQuery.setValue('APP', query.app);
                oslcQuery.setValeu('CLAUSENAME', query.clauseName);
                break;
            case 'method':
                oslcQuery.setValue('METHOD', query.method);
                oslcQuery.setValue('DESCRIPTION', query.description);
                break;
            case 'osclause':
                oslcQuery.setValue('CLAUSENAME', query.clauseName);
                oslcQuery.setValue('DESCRIPTION', query.description);
                oslcQuery.setValue('CLAUSE', query.clause);
                oslcQuery.setValue('ISPUBLIC', query.isPublic);
                break;
            case 'script':
                oslcQuery.setValue('SCRIPT', query.script);
                break;
        }
    });

    
};

main();

function main() {
    var set;

    try {

        var intObj = new IntegrationObject(JSON.parse(requestBody));

        set = MXServer.getMXServer().getMboSet('MAXINTOBJECT', userInfo);
        var sqlf = new SqlFormat('intobjectname = :1');
        sqlf.setObject(1, 'MAXINTOBJECT', 'INTOBJECTNAME', 'TESTOBJ');

        var obj;
        set.setWhere(sqlf.format());
        obj = set.moveFirst();

        var existingGroups = [];

        if (obj) {
            // if the current object has os security then we need to remove the groups from that first then put it back.

            if (obj.getBoolean('USEOSSECURITY')) {
                var applicationAuthSet;

                try {
                    applicationAuthSet = MXServer.getMXServer().getMboSet('APPLICATIONAUTH', userInfo);

                    sqlf = new SqlFormat(obj, 'app = :intobjectname');
                    applicationAuthSet.setWhere(sqlf.format());
                    applicationAuthSet.setOrderBy('groupname');
                    applicationAuth = applicationAuthSet.moveFirst();

                    var group = { 'groupName': '', 'options': [] };
                    while (applicationAuth) {
                        if (group.groupName !== applicationAuth.getString('GROUPNAME')) {
                            if (group.options.length > 0) {
                                existingGroups.push(group);
                            }
                            group = { 'groupName': applicationAuth.getString('GROUPNAME'), 'options': [] };
                        }
                        group.options.push(applicationAuth.getString('OPTIONNAME'));
                        applicationAuth.delete();
                        applicationAuth = applicationAuthSet.moveNext();
                    }
                    // push the final group.
                    if (group.options.length > 0) {
                        existingGroups.push(group);
                    }
                    applicationAuthSet.save();
                } finally {
                    if (applicationAuthSet) {
                        try {
                            applicationAuthSet.close();
                            applicationAuthSet.cleanup();
                        } catch (ignore) { /* empty */ }
                    }
                }

                set.reset();
                obj = set.getMboForUniqueId(obj.getUniqueIDValue());
            }
            obj.getMboSet('OSLCQUERY').deleteAll();
            obj.delete();
            set.save();
            set.reset();
        }
        obj = set.add();

        var id = obj.getUniqueIDValue();

        intObj.setMboValues(obj);

        set.save();

        if (intObj.useOSSecurity && existingGroups.length > 0) {
            obj = set.getMboForUniqueId(id);

            var options = [];

            var sigOptionSet = obj.getMboSet('$sigoptions', 'SIGOPTION', 'app = :intobjectname');
            var sigOption = sigOptionSet.moveFirst();

            while (sigOption) {
                options.push(sigOption.getString('OPTIONNAME'));
                sigOption = sigOptionSet.moveNext();
            }

            existingGroups.forEach(function (group) {
                var applicationAuthSet;
                try {
                    applicationAuthSet = MXServer.getMXServer().getMboSet('APPLICATIONAUTH', userInfo);
                    group.options.forEach(function (option) {
                        if (options.indexOf(option) >= 0) {
                            var applicationAuth = applicationAuthSet.add();
                            applicationAuth.setValue('GROUPNAME', group.groupName);
                            applicationAuth.setValue('APP', intObj.intObjectName, MboConstants.NOVALIDATION);
                            applicationAuth.setValue('OPTIONNAME', option);
                        }
                    });
                    applicationAuthSet.save();
                } finally {
                    try {
                        if (applicationAuthSet) {
                            applicationAuthSet.close();
                            applicationAuthSet.cleanup();
                        }

                    } catch (ignore) { /* empty */ }
                }
            });
        }
    } finally {
        if (set) {
            try {
                set.close();
                set.cleanup();
            } catch (ignore) { /* empty */ }
        }
    }

}


// eslint-disable-next-line no-unused-vars
var scriptConfig = {
    'autoscript': 'SHARPTREE.AUTOSCRIPT.INT',
    'description': 'Library Script Int Object',
    'version': '',
    'active': true,
    'logLevel': 'ERROR'
};