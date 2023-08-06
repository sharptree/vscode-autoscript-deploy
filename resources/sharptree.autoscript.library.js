/* eslint-disable indent */
/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

// @ts-nocheck

MboConstants = Java.type('psdi.mbo.MboConstants');
SqlFormat = Java.type('psdi.mbo.SqlFormat');

MXServer = Java.type('psdi.server.MXServer');

System = Java.type('java.lang.System');

MXLoggerFactory = Java.type('psdi.util.logging.MXLoggerFactory');
MXServer = Java.type('psdi.server.MXServer');
var logger = MXLoggerFactory.getLogger('maximo.script.SHARPTREE.AUTOSCRIPT.LIBRARY');

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

function MaxLogger(maxLogger) {

    if (!maxLogger) {
        throw new Error(
            'A maxLogger JSON is required to create the MaxLogger object.'
        );
    } else if (typeof maxLogger.logger === 'undefined') {
        throw new Error(
            'The logger property is required and must be a Maximo MaxLogger field value.'
        );
    }

    this.logger = maxLogger.logger;

    this.parentLogKey = typeof maxLogger.parentLogKey === 'undefined' ? '' : maxLogger.parentLogKey;
    this.logKey = typeof maxLogger.logKey === 'undefined' ? (this.parentLogKey ? this.parentLogKey + '.' : 'log4j.logger.maximo.') + maxLogger.logger : maxLogger.logKey;
    this.logLevel = typeof maxLogger.logLevel === 'undefined' ? 'ERROR' : maxLogger.logLevel;
    this.active = typeof maxLogger.active === 'undefined' ? false : maxLogger.active == true;
    this.appenders = typeof maxLogger.appenders === 'undefined' ? '' : maxLogger.appenders;

    if (this.parentLogKey && !this.logKey.startsWith(this.parentLogKey)) {
        this.logKey = this.parentLogKey + '.' + this.logger;
    }
}

MaxLogger.prototype.constructor = MaxLogger;
MaxLogger.prototype.apply = function (mboSet) {
    if (!mboSet) {
        throw new Error(
            'A MboSet is required to set values from the MaxLogger object.'
        );
    } else if (!(mboSet instanceof Java.type('psdi.mbo.MboSet'))) {
        throw new Error(
            'The mboSet parameter must be an instance of psdi.mbo.Mbo.'
        );
    } else if (!mboSet.isBasedOn('MAXLOGGER')) {
        throw new Error(
            'The mboSet parameter must be based on the MAXLOGGER Maximo object.'
        );
    }


    var sqlFormat;
    var maxLogger;
    if (this.parentLogKey) {
        sqlFormat = new SqlFormat('logkey = :1');
        sqlFormat.setObject(1, 'MAXLOGGER', 'LOGKEY', this.parentLogKey);
        mboSet.setWhere(sqlFormat.format());
        if (mboSet.isEmpty()) {
            throw new Error(
                'The parent logger key value ' + this.parentLogKey + ' does not exist in the target system, cannot add child logger ' + this.logger
            );
        } else {
            var parent = mboSet.moveFirst();
            var children = parent.getMboSet('CHILDLOGGERS');
            var child = children.moveFirst();

            while (child) {
                if (child.getString('LOGGER').toLowerCase() == this.logger.toLowerCase()) {
                    child.setValue('ACTIVE', false);
                    child.delete();
                    break;
                }
                child = children.moveNext();
            }

            maxLogger = children.add();
            maxLogger.setValue('LOGGER', this.logger);
        }
    } else {
        sqlFormat = new SqlFormat('logger = :1');
        sqlFormat.setObject(1, 'MAXLOGGER', 'LOGGER', this.logger);
        mboSet.setWhere(sqlFormat.format());
        if (!mboSet.isEmpty()) {
            maxLogger = mboSet.moveFirst();
            maxLogger.setValue('ACTIVE', false);
            maxLogger.delete();
        }
        maxLogger = mboSet.add();
        maxLogger.setValue('LOGGER', this.logger);
        maxLogger.setValue('LOGKEY', this.logKey);

    }

    maxLogger.setValue('LOGLEVEL', this.logLevel);
    maxLogger.setValue('ACTIVE', this.active);
    maxLogger.setValue('APPENDERS', this.appenders);
    mboSet.save();

    // apply the logging settings
    MXServer.getMXServer().lookup('LOGGING').applySettings(false);

};

function CronTask(cronTask) {

    if (!cronTask) {
        throw new Error(
            'A integration object JSON is required to create the CronTask object.'
        );
    } else if (typeof cronTask.cronTaskName === 'undefined') {
        throw new Error(
            'The cronTaskName property is required and must a Maximo CronTask field value.'
        );
    } else if (typeof cronTask.className === 'undefined') {
        throw new Error(
            'The className property is required and must a Maximo CronTask field value.'
        );
    }

    this.cronTaskName = cronTask.cronTaskName;
    this.description = typeof cronTask.description === 'undefined' ? '' : cronTask.description;
    this.className = cronTask.className;
    this.accessLevel = typeof cronTask.accessLevel === 'undefined' || !cronTask.accessLevel ? 'FULL' : cronTask.accessLevel;

    if (typeof cronTask.cronTaskInstance !== 'undefined' && Array.isArray(cronTask.cronTaskInstance)) {
        cronTask.cronTaskInstance.forEach(function (instance) {

            if (typeof instance.instanceName === 'undefined' || !instance.instanceName) {
                throw new Error('The CronTask object ' + cronTask.cronTaskName + ' instance is missing a name property for the instance name.');
            }

            instance.description = typeof instance.description === 'undefined' ? '' : instance.description;
            instance.schedule = typeof instance.schedule === 'undefined' ? '1h,*,0,*,*,*,*,*,*,*' : instance.schedule;
            instance.active = typeof instance.active === 'undefined' ? false : instance.active == true;
            instance.keepHistory = typeof instance.keepHistory === 'undefined' ? true : instance.keepHistory == true;
            instance.runAsUserId = typeof instance.runAsUserId === 'undefined' ? 'MAXADMIN' : instance.runAsUserId;
            instance.maxHistory = typeof instance.maxHistory === 'undefined' ? 1000 : instance.maxHistory;

            if (typeof instance.cronTaskParam !== 'undefined' && Array.isArray(instance.cronTaskParam)) {
                instance.cronTaskParam.forEach(function (cronTaskParam) {
                    if (typeof cronTaskParam.parameter === 'undefined' || !cronTaskParam.parameter) {
                        throw new Error('A CronTask object ' + cronTask.cronTaskName + ' instance ' + instance.instanceName + ' parameter is missing a parameter property.');
                    }

                    cronTaskParam.value = typeof cronTaskParam.value === 'undefined' ? '' : cronTaskParam.value;
                });
            } else {
                instance.cronTaskParam = [];
            }
        });

        this.cronTaskInstance = cronTask.cronTaskInstance;

    } else {
        this.cronTaskInstance = [];
    }
}

CronTask.prototype.constructor = CronTask;
CronTask.prototype.setMboValues = function (mbo) {
    if (!mbo) {
        throw new Error(
            'A Mbo is required to set values from the CronTask object.'
        );
    } else if (!(mbo instanceof Java.type('psdi.mbo.Mbo'))) {
        throw new Error(
            'The mbo parameter must be an instance of psdi.mbo.Mbo.'
        );
    } else if (!mbo.isBasedOn('CRONTASKDEF')) {
        throw new Error(
            'The mbo parameter must be based on the CRONTASKDEF Maximo object.'
        );
    }

    if (mbo.toBeAdded()) {
        mbo.setValue('CRONTASKNAME', this.cronTaskName);
        mbo.setValue('CLASSNAME', this.className);
        mbo.setValue('ACCESSLEVEL', this.accessLevel);
    }

    mbo.setValue('DESCRIPTION', this.description);

    var cronTaskInstanceSet = mbo.getMboSet('CRONTASKINSTANCE');
    var tmpCronTaskInstanceMbo = cronTaskInstanceSet.moveFirst();

    while (tmpCronTaskInstanceMbo) {
        tmpCronTaskInstanceMbo.setValue('ACTIVE', false);
        tmpCronTaskInstanceMbo = cronTaskInstanceSet.moveNext();
    }
    // remove all the current instances
    cronTaskInstanceSet.deleteAll();

    this.cronTaskInstance.forEach(function (instance) {
        var cronTaskInstanceMbo = cronTaskInstanceSet.add();
        cronTaskInstanceMbo.setValue('INSTANCENAME', instance.instanceName);
        cronTaskInstanceMbo.setValue('DESCRIPTION', instance.description);
        cronTaskInstanceMbo.setValue('SCHEDULE', instance.schedule);
        cronTaskInstanceMbo.setValue('RUNASUSERID', instance.runAsUserId);
        cronTaskInstanceMbo.setValue('KEEPHISTORY', instance.keepHistory);
        cronTaskInstanceMbo.setValue('ACTIVE', instance.active);
        cronTaskInstanceMbo.setValue('MAXHISTORY', instance.maxHistory);

        var cronTaskParamSet = cronTaskInstanceMbo.getMboSet('PARAMETER');

        instance.cronTaskParam.forEach(function (param) {
            var cronTaskParam = cronTaskParamSet.moveFirst();

            while (cronTaskParam) {
                if (cronTaskParam.getString('PARAMETER') == param.parameter) {
                    cronTaskParam.setValue('VALUE', param.value);
                }
                cronTaskParam = cronTaskParamSet.moveNext();
            }
        });
    });
};


function EndPoint(endPoint) {
    if (!endPoint) {
        throw new Error(
            'A integration object JSON is required to create the endPoint object.'
        );
    } else if (typeof endPoint.endPointName === 'undefined') {
        throw new Error(
            'The endPointName property is required.'
        );
    } else if (typeof endPoint.handlerName === 'undefined') {
        throw new Error(
            'The handler property is required and must a valid Maximo handler.'
        );
    }

    this.endPointName = endPoint.endPointName;
    this.description =
        typeof endPoint.description === 'undefined' ? '' : endPoint.description;
    this.handlerName = endPoint.handlerName;
    this.maxEndPointDtl =
        typeof maxEndPoint.maxEndPointDtl === 'undefined'
            ? []
            : maxEndPoint.maxEndPointDtl;
    if (!Array.isArray(this.maxEndPointDtl)) {
        endPoint.endPointDtl.forEach(function (detail) {
            if (typeof detail.property === 'undefined' || !detail.property) {
                throw new Error(
                    'Property ' +
                        detail.property +
                        ' is missing or has an empty value for the required Property name.'
                );
            }

            detail.value =
                typeof detail.value === 'undefined' ? '' : detail.value;
            detail.allowOverride =
                typeof detail.allowOverride === 'undefined'
                    ? false
                    : detail.allowOverride == true;
        });

        this.endPointDtl = endPoint.endPointDtl;
    } else {
        this.endPointDtl = [];
    }
}

EndPoint.prototype.constructor = EndPoint;
EndPoint.prototype.setMboValues = function (mbo) {
    if (!mbo) {
        throw new Error(
            'A Mbo is required to set values from the End Point object.'
        );
    } else if (!(mbo instanceof Java.type('psdi.mbo.Mbo'))) {
        throw new Error(
            'The mbo parameter must be an instance of psdi.mbo.Mbo.'
        );
    } else if (!mbo.isBasedOn('MAXENDPOINT')) {
        throw new Error(
            'The mbo parameter must be based on the MAXENDPOINT Maximo object.'
        );
    }
    if (mbo.toBeAdded()) {
        mbo.setValue('ENDPOINTNAME', this.endPointName);
    }
    mbo.setValue('DESCRIPTION', this.description);
    mbo.setValue('HANDLERNAME', this.handlerName);
    var endPointNameTemp = this.endPointName; //used to pass end point name to detail function
    this.endPointDtl.forEach(function (detail) {
        var maxEndPointDtlSet;
        try {
            maxEndPointDtlSet = mbo.getMboSet('MAXENDPOINTDTL');
            var maxEndPointDtl = maxEndPointDtlSet.moveFirst();
            while (maxEndPointDtl) {
                if (
                    maxEndPointDtl.getString('PROPERTY') ==
                    detail.property.toUpperCase()
                ) {
                    maxEndPointDtl.setValue('VALUE', detail.value);
                    maxEndPointDtl.setValue(
                        'ALLOWOVERRIDE',
                        detail.allowOverride
                    );
                    break;
                }
                maxEndPointDtl = maxEndPointDtlSet.moveNext();
            }
        } finally {
            __libraryClose(maxEndPointDtlSet);
        }
    });
};

function ExternalSystem(externalSystem) {
    if (!externalSystem) {
        throw new Error(
            'A integration object JSON is required to create the ExternalSystem object.'
        );
    } else if (typeof externalSystem.extSysName === 'undefined') {
        throw new Error(
            'The extSysName property is required and must a Maximo External System field value.'
        );
    }

    this.extSysName = externalSystem.extSysName;
    this.description =
        typeof externalSystem.description === 'undefined'
            ? ''
            : externalSystem.description;
    this.endPointName =
        typeof externalSystem.endPointName === 'undefined'
            ? ''
            : externalSystem.endPointName;
    this.bidiConfig =
        typeof externalSystem.bidiConfig === 'undefined'
            ? ''
            : externalSystem.bidiConfig;
    this.jmsMsgEncoding =
        typeof externalSystem.jmsMsgEncoding === 'undefined'
            ? ''
            : externalSystem.jmsMsgEncoding;
    this.enabled =
        typeof externalSystem.enabled === 'undefined'
            ? false
            : externalSystem.enabled == true;
    this.outSeqQueueName =
        typeof externalSystem.outSeqQueueName === 'undefined'
            ? ''
            : externalSystem.outSeqQueueName;
    this.inSeqQueueName =
        typeof externalSystem.inSeqQueueName === 'undefined'
            ? ''
            : externalSystem.inSeqQueueName;
    this.inContQueueName =
        typeof externalSystem.inContQueueName === 'undefined'
            ? ''
            : externalSystem.inContQueueName;

    //associated publish channels
    if (
        externalSystem.maxExtIfaceOut &&
        Array.isArray(externalSystem.maxExtIfaceOut)
    ) {
        externalSystem.maxExtIfaceOut.forEach(function (ifaceOut) {
            if (
                typeof ifaceOut.ifaceName === 'undefined' ||
                !ifaceOut.ifaceName
            ) {
                throw new Error(
                    'An interface name for external system ' +
                        externalSystem.extSysName +
                        ' is missing or has an empty value for the required ifaceName property.'
                );
            }

            ifaceOut.endPointName =
                typeof ifaceOut.endPointName === 'undefined'
                    ? ''
                    : ifaceOut.endPointName;
            ifaceOut.enabled =
                typeof ifaceOut.enabled === 'undefined'
                    ? false
                    : ifaceOut.enabled == true;
        });

        this.maxExtIfaceOut = externalSystem.maxExtIfaceOut;
    } else {
        this.maxExtIfaceOut = [];
    }

    //associated enterprise services
    if (
        externalSystem.maxExtIfaceIn &&
        Array.isArray(externalSystem.maxExtIfaceIn)
    ) {
        externalSystem.maxExtIfaceIn.forEach(function (ifaceIn) {
            if (
                typeof ifaceIn.ifaceName === 'undefined' ||
                !ifaceIn.ifaceName
            ) {
                throw new Error(
                    'An interface name for external system ' +
                        externalSystem.extSysName +
                        ' is missing or has an empty value for the required ifaceName property.'
                );
            }

            ifaceIn.isContinuousQueue =
                typeof ifaceIn.isContinuousQueue === 'undefined'
                    ? true
                    : ifaceIn.isContinuousQueue == true;
            ifaceIn.enabled =
                typeof ifaceIn.enabled === 'undefined'
                    ? false
                    : ifaceIn.enabled == true;
        });

        this.maxExtIfaceIn = externalSystem.maxExtIfaceIn;
    } else {
        this.maxExtIfaceIn = [];
    }
}
ExternalSystem.prototype.constructor = ExternalSystem;
ExternalSystem.prototype.setMboValues = function (mbo) {
    if (!mbo) {
        throw new Error(
            'A Mbo is required to set values from the External System object.'
        );
    } else if (!(mbo instanceof Java.type('psdi.mbo.Mbo'))) {
        throw new Error(
            'The mbo parameter must be an instance of psdi.mbo.Mbo.'
        );
    } else if (!mbo.isBasedOn('MAXEXTSYSTEM')) {
        throw new Error(
            'The mbo parameter must be based on the MAXEXTSYSTEM Maximo object.'
        );
    }
    mbo.setValue('EXTSYSNAME', this.extSysName);
    mbo.setValue('DESCRIPTION', this.description);
    mbo.setValue('ENDPOINTNAME', this.endPointName);
    mbo.setValue('JMSMSGENCODING', this.jmsMsgEncoding);
    mbo.setValue('ENABLED', this.enabled);
    mbo.setValue('OUTSEQQUEUENAME', this.outSeqQueueName);
    mbo.setValue('INSEQQUEUENAME', this.inSeqQueueName);
    mbo.setValue('INCONTQUEUENAME', this.inContQueueName);

    var maxExtIfaceOutSet = mbo.getMboSet('MAXEXTIFACEOUT');
    maxExtIfaceOutSet.deleteAll();

    this.maxExtIfaceOut.forEach(function (ifaceOut) {
        maxExtIfaceOut = maxExtIfaceOutSet.add();
        maxExtIfaceOut.setValue('IFACENAME', ifaceOut.ifaceName);
        maxExtIfaceOut.setValue('ENDPOINTNAME', ifaceOut.endPointName);
        maxExtIfaceOut.setValue('ENABLED', ifaceOut.enabled);
    });

    var maxExtIfaceInSet = mbo.getMboSet('MAXEXTIFACEIN');
    maxExtIfaceInSet.deleteAll();

    this.maxExtIfaceIn.forEach(function (ifaceOut) {
        maxExtIfaceIn = maxExtIfaceInSet.add();
        maxExtIfaceIn.setValue('IFACENAME', ifaceOut.ifaceName);
        maxExtIfaceIn.setValue('ISCONTINUOUSQUEUE', ifaceOut.isContinuousQueue);
        maxExtIfaceIn.setValue('ENABLED', ifaceOut.enabled);
    });
};
  
  

function Message(message) {
    if (!message) {
        throw new Error(
            'A message JSON is required to create the Message object.'
        );
    } else if (typeof message.msgGroup === 'undefined') {
        throw new Error(
            'The msgGroup property is required and must a Maximo Message Group field value.'
        );
    } else if (typeof message.msgKey === 'undefined') {
        throw new Error(
            'The msgKey property is required and must a Maximo Message Key field value.'
        );
    } else if (typeof message.value === 'undefined') {
        throw new Error(
            'The value property is required and must a Maximo Value field value.'
        );
    }

    this.msgGroup = message.msgGroup;
    this.msgKey = message.msgKey;
    this.value = message.value;
    this.msgId = typeof message.msgId === 'undefined' ? null : message.msgId;
    this.displayMethod = typeof message.displayMethod === 'undefined' ? 'MSGBOX' : message.displayMethod;
    this.options = typeof message.options === 'undefined' || !Array.isArray(message.options) ? ['ok'] : message.options;
    this.prefix = typeof message.prefix === 'undefined' ? 'BMXZZ' : message.prefix;
    this.suffix = typeof message.suffix === 'undefined' ? 'E' : message.suffix;
}

Message.prototype.constructor = Message;
Message.prototype.setMboValues = function (mbo) {
    if (!mbo) {
        throw new Error(
            'A Mbo is required to set values from the Message object.'
        );
    } else if (!(mbo instanceof Java.type('psdi.mbo.Mbo'))) {
        throw new Error(
            'The mbo parameter must be an instance of psdi.mbo.Mbo.'
        );
    } else if (!mbo.isBasedOn('MAXMESSAGES')) {
        throw new Error(
            'The mbo parameter must be based on the MAXMESSAGES Maximo object.'
        );
    }

    mbo.setValue('MSGGROUP', this.msgGroup);
    mbo.setValue('MSGKEY', this.msgKey);
    mbo.setValue('VALUE', this.value);
    mbo.setValue('DISPLAYMETHOD', this.displayMethod);

    if (this.msgId) {
        mbo.setValue('MSGID', this.msgId);
    } else {
        this.prefix
            ? mbo.setValue('MSGIDPREFIX', this.prefix)
            : mbo.setValue('MSGIDPREFIX', 'BMXZZ');
        this.suffix
            ? mbo.setValue('MSGIDSUFFIX', this.suffix)
            : mbo.setValue('MSGIDSUFFIX', 'E');
    }

    this.options.forEach(function (option) {
        switch (option.toLowerCase()) {
            case 'ok':
                mbo.setValue('OK', true);
                break;
            case 'close':
                mbo.setValue('CLOSE', true);
                break;
            case 'cancel':
                mbo.setValue('CANCEL', true);
                break;
            case 'yes':
                mbo.setValue('YES', true);
                break;
            case 'no':
                mbo.setValue('NO', true);
                break;
        }
    });
};

function Property(property) {
    if (typeof property.propName === 'undefined') {
        throw new Error(
            'The propName property is required and must be a Maximo Property Name field value.'
        );
    }

    this.propName = property.propName;
    this.description = typeof property.description === 'undefined' ? '' : property.description;
    this.domainId = typeof property.domainId === 'undefined' ? '' : property.domainId;
    this.encrypted = typeof property.encrypted === 'undefined' ? false : property.encrypted == true;
    this.globalOnly = typeof property.globalOnly === 'undefined' ? false : property.globalOnly == true;
    this.instanceOnly = typeof property.instanceOnly === 'undefined' ? false : property.instanceOnly == true;
    this.liveRefresh = typeof property.liveRefresh === 'undefined' ? true : property.liveRefresh == true;
    this.masked = typeof property.masked === 'undefined' ? false : property.masked == true;
    this.maxType = typeof property.maxType === 'undefined' ? 'ALN' : property.maxType;
    this.nullsAllowed = typeof property.nullsAllowed === 'undefined' ? true : property.nullsAllowed == true;
    this.onlineChanges = typeof property.onlineChanges === 'undefined' ? true : property.onlineChanges == true;
    this.secureLevel = typeof property.secureLevel === 'undefined' ? 'PUBLIC' : property.secureLevel;
    this.propValue = typeof property.propValue === 'undefined' ? '' : property.propValue;
    
    this.maximoDefault = typeof property.maximoDefault === 'undefined' ? '' : property.maximoDefault;
    if (property.maxPropInstance && Array.isArray(property.maxPropInstance)) {
        property.maxPropInstance.forEach(function (instance) {

            if (typeof instance.serverName === 'undefined' || !instance.serverName) {
                throw new Error(
                    'A property instance for property ' + property.propName + ' is missing or has an empty value for the required serverName property.'
                );
            }

            if (instance.serverName.toLowerCase() == 'common') {
                throw new Error(
                    'A property instance for property ' + property.propName + ' has a value of COMMON for the serverName property, define COMMON property values using the dispPropValue property on the root property object.'
                );
            }

            instance.propValue = typeof instance.propValue === 'undefined' ? '' : instance.propValue;
            instance.serverHost = typeof instance.serverHost === 'undefined' ? '' : instance.serverHost;
        });

        this.maxPropInstance = property.maxPropInstance;
    } else {
        this.maxPropInstance = [];
    }
}

Property.prototype.constructor = Property;
Property.prototype.setMboValues = function (mbo) {
    if (!mbo) {
        throw new Error(
            'A Mbo is required to set values from the Properties object.'
        );
    } else if (!(mbo instanceof Java.type('psdi.mbo.Mbo'))) {
        throw new Error(
            'The mbo parameter must be an instance of psdi.mbo.Mbo.'
        );
    } else if (!mbo.isBasedOn('MAXPROP')) {
        throw new Error(
            'The mbo parameter must be based on the MAXPROP Maximo object.'
        );
    }

    // if this is a system only a select few things can be altered and the property can't be deleted.
    if (mbo.isSystemProperty()) {
        mbo.setValue('DESCRIPTION', this.description);
        mbo.setValue('ENCRYPTED', this.encrypted);
        mbo.setValue('MASKED', this.masked);
        mbo.setValue('DISPPROPVALUE', this.propValue);
    } else {
        if (mbo.toBeAdded()) {
            mbo.setValue('PROPNAME', this.propName);
        }
        mbo.setValue('MAXIMODEFAULT', this.maximoDefault, MboConstants.NOACCESSCHECK);
        mbo.setValue('DESCRIPTION', this.description);
        mbo.setValue('DOMAINID', this.domainId);
        mbo.setValue('ENCRYPTED', this.encrypted);
        mbo.setValue('GLOBALONLY', this.globalOnly);
        mbo.setValue('INSTANCEONLY', this.instanceOnly);
        mbo.setValue('LIVEREFRESH', this.liveRefresh);
        mbo.setValue('MASKED', this.masked);
        mbo.setValue('MAXTYPE', this.maxType);
        mbo.setValue('NULLSALLOWED', this.nullsAllowed);
        mbo.setValue('ONLINECHANGES', this.onlineChanges);
        mbo.setValue('SECURELEVEL', this.secureLevel);

        if (!this.instanceOnly) {
            mbo.setValue('DISPPROPVALUE', this.propValue);
        }
    }

    var maxPropInstanceSet = mbo.getMboSet('MAXPROPINSTANCE');
    maxPropInstanceSet.deleteAll();

    if (!this.globalOnly) {
        this.maxPropInstance.forEach(function (instance) {
            maxPropInstance = maxPropInstanceSet.add();
            maxPropInstance.setValue('DISPPROPVALUE', instance.propValue, MboConstants.NOVALIDATION);
            maxPropInstance.setValue('SERVERNAME', instance.serverName);
            maxPropInstance.setValue('SERVERHOST', instance.serverHost);
        });
    }
    return;
};

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
        throw new Error(
            'The integration object ' + this.intObjectName + ' contains a object detail record that does not contain an object name.'
        );
    }

    if (intObject.maxIntObjDetails.find(function (maxIntObjDetail) { return typeof maxIntObjDetail.parentObjName !== 'undefined' && maxIntObjDetail.parentObjName && (typeof maxIntObjDetail.relation === 'undefined' || !maxIntObjDetail.relation); })) {
        throw new Error(
            'The integration object ' + this.intObjectName + ' contains a child object detail record that does not contain a relation name.'
        );
    }

    var parents = intObject.maxIntObjDetails.filter(function (maxIntObjDetail) {
        return typeof maxIntObjDetail.parentObjName === 'undefined' || !maxIntObjDetail.parentObjName;
    });

    if (parents.length == 0) {
        throw new Error(
            'The integration object ' + this.intObjectName + ' does not have a top level object detail record, a top level parent must be defined for an integration object.'
        );
    }

    if (parents.length > 1) {
        throw new Error(
            'The integration object ' + this.intObjectName + ' has more than one top level object detail record, only one top level parent can be defined for an integration object.'
        );
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

    if (typeof intObject.queryTemplate !== 'undefined' && intObject.queryTemplate && Array.isArray(intObject.queryTemplate)) {
        intObject.queryTemplate.forEach(function (template) {
            if (typeof template.templateName === 'undefined' || !template.templateName) {
                throw new Error('A queryTemplate entry is missing the required templateName property.');
            }
            template.description = typeof template.description === 'undefined' ? '' : template.description;
            template.pageSize = typeof template.pageSize === 'undefined' ? '' : template.pageSize;
            template.role = typeof template.role === 'undefined' ? '' : template.role;
            template.searchAttributes = typeof template.searchAttributes === 'undefined' ? '' : template.searchAttributes;
            template.timelineAttributes = typeof template.timelineAttributes === 'undefined' ? '' : template.timelineAttributes;
            template.isPublic = typeof template.isPublic === 'undefined' ? true : template.isPublic == true;

            if (typeof template.queryTemplateAttr !== 'undefined' && template.queryTemplateAttr && Array.isArray(template.queryTemplateAttr)) {
                template.queryTemplateAttr.forEach(function (attr) {
                    if (typeof attr.selectAttrName === 'undefined' || !attr.selectAttrName) {
                        throw new Error('A queryTemplateAttr entry is missing the required selectAttrName property.');
                    }

                    attr.title = typeof attr.title === 'undefined' ? '' : attr.title;
                    attr.selectOrder = typeof attr.selectOrder === 'undefined' ? '' : attr.selectOrder;
                    attr.alias = typeof attr.alias === 'undefined' ? '' : attr.alias;
                    attr.sortByOrder = typeof attr.sortByOrder === 'undefined' ? '' : attr.sortByOrder;
                    attr.sortByOn = typeof attr.sortByOn === 'undefined' ? false : attr.sortByOn == true;
                    attr.ascending = typeof attr.ascending === 'undefined' ? false : attr.ascending == true;
                });
            } else {
                template.queryTemplateAttr = [];
            }

        });
        this.queryTemplate = intObject.queryTemplate;
    } else {
        this.queryTemplate = [];
    }
}

IntegrationObject.prototype.constructor = IntegrationObject;
IntegrationObject.prototype.setMboValues = function (mbo) {
    if (!mbo) {
        throw new Error('A Mbo is required to set values from the IntegrationObject object.');
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

    var queryTemplateSet = mbo.getMboSet('QUERYTEMPLATE');

    this.queryTemplate.forEach(function (template) {
        var queryTemplate = queryTemplateSet.add();
        queryTemplate.setValue('TEMPLATENAME', template.templateName);
        queryTemplate.setValue('DESCRIPTION', template.description);
        queryTemplate.setValue('PAGESIZE', template.pageSize);
        queryTemplate.setValue('ROLE', template.role);
        queryTemplate.setValue('SEARCHATTRIBUTES', template.searchAttributes);
        queryTemplate.setValue('TIMELINEATTRIBUTE', template.timelineAttributes);
        queryTemplate.setValue('ISPUBLIC', template.isPublic);


        var queryTemplateAttrSet = queryTemplate.getMboSet('QUERYTEMPLATEATTR');
        template.queryTemplateAttr.forEach(function (attr) {
            var queryTemplateAttr = queryTemplateAttrSet.add();
            queryTemplateAttr.setValue('SELECTATTRNAME', attr.selectAttrName);
            queryTemplateAttr.setValue('TITLE', attr.title);
            queryTemplateAttr.setValue('SELECTORDER', attr.selectOrder);
            queryTemplateAttr.setValue('ALIAS', attr.alias);
            queryTemplateAttr.setValue('SORTBYON', attr.sortByOn);
            queryTemplateAttr.setValue('ASCENDING', attr.ascending);
            queryTemplateAttr.setValue('SORTBYORDER', attr.sortByOrder);
        });
    });
};

// Main function that is called when the script is invoked.
// This is provided for testing purposes.
mainLibrary();

function mainLibrary() {
    // if the script is being invoked from the web then parse the requestBody and proces.
    if (typeof request !== 'undefined' && typeof requestBody !== 'undefined' && requestBody && request.getQueryParam("develop") == "true") {
        var config = JSON.parse(requestBody);
        deployConfig(config);
        responseBody = JSON.stringify({
            'status': 'success',
            'message': 'Sucessfully deploy the configuration changes.'
        }, null, 4);
    }
}

/**
 * Deploys the array of messages, properties, or other items.
 * 
 * @param {*} config A parsed JSON array of messages, properties, and other items to be added, updated, or deleted.
 */
function deployConfig(config) {
    logger.debug('Deploying Configuration: \n' + JSON.stringify(config, null, 4));
    if (typeof config.messages !== 'undefined') {
      deployMessages(config.messages);
    }
    if (typeof config.properties !== 'undefined') {
      deployProperties(config.properties);
    }
    if (typeof config.integrationObjects !== 'undefined') {
      deployIntegrationObjects(config.integrationObjects);
    }
    if (typeof config.cronTasks !== 'undefined') {
      deployCronTasks(config.cronTasks);
    }
    if (typeof config.EndPoints !== 'undefined') {
      deployEndPoints(config.endPoints);
    }
    if (typeof config.ExternalSystem !== 'undefined') {
      deployExternalSystems(config.externalSystems);
    }
    if (typeof config.loggers !== 'undefined') {
        deployLoggers(config.loggers);
    }
  }


function deployLoggers(loggers) {
    if (!loggers || !Array.isArray(loggers)) {
        throw new Error(
            'The loggers parameter is required and must be an array of MaxLogger objects.'
        );
    }

    loggers.forEach(function (logger) {
        if (typeof logger.delete !== 'undefined' && logger.delete == true) {
            deleteLogger(logger);
        } else {
            addOrUpdateLogger(logger);
        }
    });
}

function addOrUpdateLogger(logger) {
    var set;

    try {
        var loggerObj = new MaxLogger(logger);
        set = MXServer.getMXServer().getMboSet('MAXLOGGER', userInfo);
        loggerObj.apply(set);
    } finally {
        __libraryClose(set);
    }
}

function deleteLogger(logger) {
    var set;

    try {
        var loggerObj = new MaxLogger(logger);

        set = MXServer.getMXServer().getMboSet('MAXLOGGER', userInfo);
        var sqlFormat = new SqlFormat('logger = :1');
        sqlFormat.setObject(1, 'MAXLOGGER', 'LOGGER', loggerObj.logger);
        set.setWhere(sqlFormat.format());
        var obj = set.moveFirst();
        if (obj) {
            obj.setValue('ACTIVE', false);
            obj.delete();
            set.save();
        }

    } finally {
        __libraryClose(set);
    }
}

function deployCronTasks(cronTasks) {
    if (!cronTasks || !Array.isArray(cronTasks)) {
        throw new Error(
            'The cronTasks parameter is required and must be an array of CronTask objects.'
        );
    }

    cronTasks.forEach(function (cronTask) {
        if (typeof cronTask.delete !== 'undefined' && cronTask.delete == true) {
            deleteCronTask(cronTask);
        } else {
            addOrUpdateCronTask(cronTask);
        }
    });
}

function deleteCronTask(cronTask) {
    var set;

    try {
        var cronTaskObj = new CronTask(cronTask);

        set = MXServer.getMXServer().getMboSet('CRONTASKDEF', userInfo);
        var sqlFormat = new SqlFormat('crontaskname = :1');
        sqlFormat.setObject(1, 'CRONTASKDEF', 'CRONTASKNAME', cronTaskObj.cronTaskName);
        set.setWhere(sqlFormat.format());
        var obj = set.moveFirst();
        if (obj) {
            var cronTaskInstanceSet = obj.getMboSet('CRONTASKINSTANCE');
            var cronTaskInstance = cronTaskInstanceSet.moveFirst();

            while (cronTaskInstance) {
                cronTaskInstance.setValue('ACTIVE', false);
                cronTaskInstance = cronTaskInstanceSet.moveNext();
            }

            cronTaskInstanceSet.deleteAll();

            // set access to full to ensure we can delete the cron task.
            obj.setValue('ACCESSLEVEL', 'FULL', MboConstants.NOACCESSCHECK);
            set.save();
            set.setWhere(sqlFormat.format());
            set.reset();
            set.deleteAll();
            set.save();
        }

    } finally {
        __libraryClose(set);
    }
}

function addOrUpdateCronTask(cronTask) {
    var set;

    try {
        var cronTaskObj = new CronTask(cronTask);
        set = MXServer.getMXServer().getMboSet('CRONTASKDEF', userInfo);
        var sqlFormat = new SqlFormat('crontaskname = :1');
        sqlFormat.setObject(1, 'CRONTASKDEF', 'CRONTASKNAME', 'TESTCRON');

        var obj;
        set.setWhere(sqlFormat.format());
        obj = set.moveFirst();

        if (obj) {
            var cronTaskInstanceSet = obj.getMboSet('CRONTASKINSTANCE');
            var cronTaskInstance = cronTaskInstanceSet.moveFirst();

            while (cronTaskInstance) {
                cronTaskInstance.setValue('ACTIVE', false);
                cronTaskInstance = cronTaskInstanceSet.moveNext();
            }
            cronTaskInstanceSet.deleteAll();
            obj.setValue('ACCESSLEVEL', 'FULL', MboConstants.NOACCESSCHECK);
            set.save();
            set.setWhere(sqlFormat.format());
            set.reset();
            set.deleteAll();
        }

        obj = set.add();
        cronTaskObj.setMboValues(obj);

        set.save();

    } finally {
        __libraryClose(set);
    }
}

/**
 * Deploys the array of end points provided. If an end point has the value of delete set to true, that end point
 * will be deleted based on the end point's endPointName.
 *
 * @param {EndPoint[]} endPoints a JSON array of end points to be added, updated or deleted.
 */
function deployEndPoints(endPoints) {
    if (!endPoints || !Array.isArray(endPoints)) {
      throw new Error(
        'The endPoints parameter is required and must be an array of external system objects.'
      );
    }
  
    endPoints.forEach(function (endPoint) {
      if (typeof endPoint.delete !== 'undefined' && endPoint.delete == true) {
        deleteEndPoint(endPoint);
      } else {
        addOrUpdateEndPoint(endPoint);
      }
    });
  }
  
  /**
   * Adds an end point if it does not exist or updates it to match the described state if the end point exists.
   * @param {EndPoint} endPoint single end point that will be added/updated
   */
  function addOrUpdateEndPoint(endPoint) {
    logger.debug('Setting up the ' + endPoint.endPointName + ' end point.');
    var maxEndPointSet;
    try {
      maxEndPointSet = MXServer.getMXServer().getMboSet(
        'MAXENDPOINT',
        MXServer.getMXServer().getSystemUserInfo()
      );
      var endPnt = new EndPoint(endPoint);
      var sqlf = new SqlFormat('endpointname = :1');
      sqlf.setObject(1, 'MAXENDPOINT', 'ENDPOINTNAME', endPoint.endPointName);
      maxEndPointSet.setWhere(sqlf.format());
  
      if (!maxEndPointSet.isEmpty()) {
        maxEndPointSet.deleteAll();
        maxEndPointSet.save();
      }
      endPnt.setMboValues(maxEndPointSet.add());
      maxEndPointSet.save();
    } finally {
      __libraryClose(maxEndPointSet);
    }
    logger.debug('Setup up the ' + endPoint.endPointName + ' end point.');
  }
  
  /**
   * Removes the provided end point by matching the endPointName property.
   * @param {EndPoint} endPoint single end point that will be deleted.
   */
  function deleteEndPoint(endPoint) {
    logger.debug('Deleting the ' + endPoint.endPointName + ' end point.');
    var maxEndPointSet;
    try {
      maxEndPointSet = MXServer.getMXServer().getMboSet(
        'MAXENDPOINT',
        MXServer.getMXServer().getSystemUserInfo()
      );
      var endPnt = new EndPoint(endPoint);
      var sqlf = new SqlFormat('endpointname = :1');
      sqlf.setObject(1, 'MAXENDPOINT', 'ENDPOINTNAME', endPoint.endPointName);
      maxEndPointSet.setWhere(sqlf.format());
  
      if (!maxEndPointSet.isEmpty()) {
        maxEndPointSet.deleteAll();
        maxEndPointSet.save();
      }
    } finally {
      __libraryClose(maxEndPointSet);
    }
    logger.debug('Deleted the ' + endPoint.endPointName + ' end point.');
  }

/**
 * Deploys the array of external systems provided. If an external system has the value of delete set to true, that external system
 * will be deleted based on the external system's extSysName.
 *
 * @param {ExternalSystem[]} externalSystems a JSON array of external systems to be added, updated or deleted.
 */
function deployExternalSystems(externalSystems) {
    if (!externalSystems || !Array.isArray(externalSystems)) {
      throw new Error(
        'The externalSystems parameter is required and must be an array of external system objects.'
      );
    }
  
    externalSystems.forEach(function (externalSystem) {
      if (
        typeof externalSystem.delete !== 'undefined' &&
        externalSystem.delete == true
      ) {
        deleteExternalSystem(externalSystem);
      } else {
        addOrUpdateExternalSystem(externalSystem);
      }
    });
  }
  
  /**
   * Adds an external system if it does not exist or updates it to match the described state if the external system exists.
   * @param {ExternalSystem} externalSystem single external system that will be added/updated
   */
  function addOrUpdateExternalSystem(externalSystem) {
    logger.debug(
      'Setting up the ' + externalSystem.extSysName + ' external sytsem.'
    );
    var maxExtSystemSet;
    try {
      maxExtSystemSet = MXServer.getMXServer().getMboSet(
        'MAXEXTSYSTEM',
        MXServer.getMXServer().getSystemUserInfo()
      );
      var extSys = new ExternalSystem(externalSystem);
      var sqlf = new SqlFormat('extsysname = :1');
      sqlf.setObject(1, 'MAXEXTSYSTEM', 'EXTSYSNAME', externalSystem.extSysName);
      maxExtSystemSet.setWhere(sqlf.format());
  
      if (!maxExtSystemSet.isEmpty()) {
        maxExtSystemSet.deleteAll();
        maxExtSystemSet.save();
      }
      extSys.setMboValues(maxExtSystemSet.add());
      maxExtSystemSet.save();
    } finally {
      __libraryClose(maxExtSystemSet);
    }
    logger.debug(
      'Setup up the ' + externalSystem.extSysName + ' external sytsem.'
    );
  }
  
  /**
   * Removes the provided external system by matching the extSysName properties.
   * @param {ExternalSystem} externalSystem single external system that will be deleted.
   */
  function deleteExternalSystem(externalSystem) {
    logger.debug(
      'Deleting the ' + externalSystem.extSysName + ' external sytsem.'
    );
    var maxExtSystemSet;
    try {
      maxExtSystemSet = MXServer.getMXServer().getMboSet(
        'MAXEXTSYSTEM',
        MXServer.getMXServer().getSystemUserInfo()
      );
      var extSys = new ExternalSystem(externalSystem);
      var sqlf = new SqlFormat('extsysname = :1');
      sqlf.setObject(1, 'MAXEXTSYSTEM', 'EXTSYSNAME', externalSystem.extSysName);
      maxExtSystemSet.setWhere(sqlf.format());
  
      if (!maxExtSystemSet.isEmpty()) {
        var maxExtSystem = maxExtSystemSet.moveFirst();
        maxExtSystem.setValue('ENABLED', false);
        maxExtSystemSet.deleteAll();
        maxExtSystemSet.save();
      }
    } finally {
      __libraryClose(maxExtSystemSet);
    }
    logger.debug('Deleted the ' + this.extSysName + ' external sytsem.');
  }

function deployIntegrationObjects(integrationObjects) {
    if (!integrationObjects || !Array.isArray(integrationObjects)) {
        throw new Error(
            'The integrationObjects parameter is required and must be an array of integration object objects.'
        );
    }

    logger.debug('Integration Objects: \n' + JSON.stringify(integrationObjects, null, 4));

    integrationObjects.forEach(function (integrationObject) {
        if (typeof integrationObject.delete !== 'undefined' && integrationObject.delete == true) {
            deleteIntegrationObject(integrationObject);
        } else {
            addOrUpdateIntegrationObject(integrationObject);
        }
    });
}

function deleteIntegrationObject(integrationObject) {

    var set;

    try {
        var intObj = new IntegrationObject(integrationObject);

        set = MXServer.getMXServer().getMboSet('MAXINTOBJECT', userInfo);
        var sqlFormat = new SqlFormat('intobjectname = :1');
        sqlFormat.setObject(1, 'MAXINTOBJECT', 'INTOBJECTNAME', intObj.intObjectName);
        set.setWhere(sqlFormat.format());
        var obj = set.moveFirst();

        if (obj) {
            // manually delete the olscquery and querytemplate objects because they are not automatically removed.
            obj.getMboSet('OSLCQUERY').deleteAll();
            obj.getMboSet('QUERYTEMPLATE').deleteAll();
            obj.delete();
            set.save();
        }
    } finally {
        __libraryClose(set);
    }
}

function addOrUpdateIntegrationObject(integrationObject) {
    var set;

    try {
        var intObj = new IntegrationObject(integrationObject);

        set = MXServer.getMXServer().getMboSet('MAXINTOBJECT', userInfo);
        var sqlFormat = new SqlFormat('intobjectname = :1');
        sqlFormat.setObject(1, 'MAXINTOBJECT', 'INTOBJECTNAME', intObj.intObjectName);

        set.setWhere(sqlFormat.format());
        var obj = set.moveFirst();

        var existingGroups = [];

        if (obj) {
            // if the current object has os security then we need to remove the groups from that first then put it back.
            if (obj.getBoolean('USEOSSECURITY')) {
                var applicationAuthSet;

                try {
                    applicationAuthSet = MXServer.getMXServer().getMboSet('APPLICATIONAUTH', userInfo);

                    sqlFormat = new SqlFormat(obj, 'app = :intobjectname');
                    applicationAuthSet.setWhere(sqlFormat.format());
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
            // manually delete the olscquery and querytemplate objects because they are not automatically removed.
            obj.getMboSet('OSLCQUERY').deleteAll();
            obj.getMboSet('QUERYTEMPLATE').deleteAll();
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
        __libraryClose(set);
    }
}

/**
 * Deploys the array of messages provided. If a message has the property of delete set to true, that message
 * will be deleted based on the message's msgId or msgGroup and msgKey.
 *
 * @param {*} messages A JSON array of messages to be added, updated or deleted
 */
function deployMessages(messages) {    
    if (!messages || !Array.isArray(messages)) {
        throw new Error(
            'The messages parameter is required and must be an array of message objects.'
        );
    }

    logger.debug('Deploying Messages: \n' + JSON.stringify(messages, null, 4));

    messages.forEach(function (message) {
        if (typeof message.delete !== 'undefined' && message.delete == true) {
            deleteMessage(message);
        } else {
            addOrUpdateMessage(message);
        }
    });
}

/**
 * Adds a message if it does not exist or updates it to match the described state if the message exists.
 * @param {Message} message single message that will be added/updated
 */
function addOrUpdateMessage(message) {
    logger.debug('addUpdateMessage function called');

    var maxMessageSet;
    try {
        maxMessageSet = MXServer.getMXServer().getMboSet(
            'MAXMESSAGES',
            MXServer.getMXServer().getSystemUserInfo()
        );
        var msg = new Message(message);

        var sqlf = new SqlFormat('msggroup = :1 and msgkey = :2');
        sqlf.setObject(1, 'MAXMESSAGES', 'MSGGROUP', msg.msgGroup);
        sqlf.setObject(2, 'MAXMESSAGES', 'MSGKEY', msg.msgKey);

        maxMessageSet.setWhere(sqlf.format());

        // remove the current message if it exists
        if (!maxMessageSet.isEmpty()) {
            maxMessageSet.getMbo(0).delete();
            maxMessageSet.save();
            maxMessageSet.reset();
        }

        msg.setMboValues(maxMessageSet.add());

        maxMessageSet.save();
    } finally {
        __libraryClose(maxMessageSet);
    }

    logger.debug('addUpdateMessage function end');
}

/**
 * Removes the provided message by matching the msgGroup and msgKey properties.
 *
 * @param {Message} message single message that will be deleted.
 */
function deleteMessage(message) {
    if (!message) {
        throw new Error('The message parameter is required for the removeMessage function.');
    }

    var messageObj = new Message(message);

    var sqlf = new SqlFormat('msggroup = :1 and msgkey = :2');
    sqlf.setObject(1, 'MAXMESSAGES', 'MSGGROUP', messageObj.msgGroup);
    sqlf.setObject(2, 'MAXMESSAGES', 'MSGKEY', messageObj.msgKey);

    var messageSet;
    try {
        messageSet = MXServer.getMXServer().getMboSet('MAXMESSAGES', MXServer.getMXServer().getSystemUserInfo());

        messageSet.setWhere(sqlf.format());

        messageSet.deleteAll();

        messageSet.save();
    } finally {
        __libraryClose(messageSet);
    }
}

/**
 * Deploys the array of properties provided. If a property has the value of delete set to true, that property
 * will be deleted based on the property's propName.
 * 
 * @param {Property[]} properties a JSON array of properties to be added, updated or deleted.
 */
function deployProperties(properties) {
    if (!properties || !Array.isArray(properties)) {
        throw new Error('The properties parameter is required and must be an array of property objects.');
    }

    properties.forEach(function (property) {
        if (typeof property.delete !== 'undefined' && property.delete == true) {
            deleteProperty(property);
        } else {
            addOrUpdateProperty(property);
        }
    });
}

/**
 * Adds a property if it does not exist or updates it to match the described state if the property exists.
 * 
 * @param {Property} property single property that will be added or updated if it already exists.
 */
function addOrUpdateProperty(property) {
    var maxPropertySet;
    try {
        var propertyObj = new Property(property);

        maxPropertySet = MXServer.getMXServer().getMboSet('MAXPROP', MXServer.getMXServer().getSystemUserInfo());

        var sqlf = new SqlFormat('propname = :1');
        sqlf.setObject(1, 'MAXPROP', 'PROPNAME', propertyObj.propName);
        maxPropertySet.setWhere(sqlf.format());

        var maxProperty = maxPropertySet.moveFirst();
        if (!maxProperty) {
            maxProperty = maxPropertySet.add();
        }

        propertyObj.setMboValues(maxProperty);

        maxPropertySet.save();

        if (maxProperty.getBoolean('LIVEREFRESH')) {
            // refresh the properties so the current value is available.
            maxPropertySet.liveRefresh();
        }
    } finally {
        __libraryClose(maxPropertySet);
    }
}

/**
 * Removes the provided property by matching the propName property.
 * @param {*} property single property that will be deleted
 */
function deleteProperty(property) {
    logger.debug(
        'deleteProperty function called, passed property ' + property + ' argument'
    );

    if (!property) {
        throw new Error(
            'The property parameter is required for the deleteProperty function.'
        );
    }

    var maxPropSet;
    try {
        maxPropSet = MXServer.getMXServer().getMboSet(
            'MAXPROP',
            MXServer.getMXServer().getSystemUserInfo()
        );
        var sqlf = new SqlFormat('propname = :1');
        sqlf.setObject(1, 'MAXPROP', 'PROPNAME', property.propName);
        maxPropSet.setWhere(sqlf.format());

        if (!maxPropSet.isEmpty()) {
            //property exists, delete
            logger.debug(
                'Property ' + property.propName + ' exists. Deleting the property.'
            );
            maxPropSet.deleteAll();
        } else {
            //property does not exist
            logger.debug(
                'Property ' + property.propName + ' does not exist. Taking no action.'
            );
        }

        maxPropSet.save();
    } finally {
        __libraryClose(maxPropSet);
    }
    logger.debug('removeProperty function end');
}

/**
 * Adds or updates a logger. This relies on the calling function calling save on the provided parent MboSet to save the changes.
 *
 * @param {*} loggerName The logger to add.
 * @param {*} level The log level to set the logger at.
 * @param {*} parent The parent logger to add the child logger to.
 */
function __addLoggerIfDoesNotExist(loggerName, level, parent) {
    logger.debug(
        'Adding or updating the logger ' +
        loggerName +
        ' and setting the level to ' +
        level +
        '.'
    );
    var loggerSet;
    try {
        loggerSet = MXServer.getMXServer().getMboSet(
            'MAXLOGGER',
            MXServer.getMXServer().getSystemUserInfo()
        );

        // Query for the log key
        var sqlFormat = new SqlFormat('logkey = :1');
        sqlFormat.setObject(
            1,
            'MAXLOGGER',
            'LOGKEY',
            parent.getString('LOGKEY') + '.' + loggerName
        );

        loggerSet.setWhere(sqlFormat.format());
        var child;
        // if the logkey does not exist create it, otherwise get the existing logger and update its level.
        if (loggerSet.isEmpty()) {
            child = parent.getMboSet('CHILDLOGGERS').add();
            child.setValue('LOGGER', loggerName);
            child.setValue('LOGLEVEL', level);
            logger.debug(
                'Added the logger ' +
                loggerName +
                ' and set the level to ' +
                level +
                '.'
            );
        }
    } finally {
        __libraryClose(loggerSet);
    }
}

/**
 * Add a menu item to the provided app.
 * 
 * @param {String} app The application to add the menu item to.
 * @param {String} optionName The option that the menu to should be added for.
 * @param {String} below The option name for the menu that the new option will be added below.
 * @param {boolean} visible Indicates if the menu option is visible.
 * @param {String} tabDisplay The tabs tha the menu should be displays on.
 */
function __addMenu(app, optionName, below, visible, tabDisplay) {
    var maxMenuSet;
    var maxMenu;
    try {
        maxMenuSet = MXServer.getMXServer().getMboSet(
            'MAXMENU',
            MXServer.getMXServer().getSystemUserInfo()
        );

        var position = 0;
        var subPosition = 0;
        if (below) {
            var sqlf = new SqlFormat(
                'moduleapp = :1 and elementtype = :2 and keyvalue = :3'
            );
            sqlf.setObject(1, 'MAXMENU', 'MODULEAPP', app);
            sqlf.setObject(2, 'MAXMENU', 'ELEMENTTYPE', 'OPTION');
            sqlf.setObject(3, 'MAXMENU', 'KEYVALUE', below);

            maxMenuSet.setWhere(sqlf.format());
            maxMenu = maxMenuSet.moveFirst();

            if (maxMenu) {
                if (!maxMenu.isNull('SUBPOSITION')) {
                    position = maxMenu.getInt('POSITION');
                    subPosition = maxMenu.getInt('SUBPOSITION') + 1;
                } else {
                    position = maxMenu.getInt('POSITION') + 1;
                }
            }
        }

        if (position == 0) {
            sqlf = new SqlFormat('moduleapp = :1 and elementtype = :2');
            sqlf.setObject(1, 'MAXMENU', 'MODULEAPP', app);
            sqlf.setObject(2, 'MAXMENU', 'ELEMENTTYPE', 'OPTION');

            maxMenuSet.setWhere(sqlf.format());
            maxMenuSet.setOrderBy('position desc');
            maxMenuSet.reset();
            maxMenu = maxMenuSet.moveFirst();
            position = maxMenu.getInt('POSITION') + 1;
        }

        sqlf = new SqlFormat(
            'moduleapp = :1 and elementtype = :2 and keyvalue = :3'
        );
        sqlf.setObject(1, 'MAXMENU', 'MODULEAPP', app);
        sqlf.setObject(2, 'MAXMENU', 'ELEMENTTYPE', 'OPTION');
        sqlf.setObject(3, 'MAXMENU', 'KEYVALUE', optionName);

        maxMenuSet.setWhere(sqlf.format());
        maxMenuSet.reset();

        if (maxMenuSet.isEmpty()) {
            maxMenu = maxMenuSet.add();
            maxMenu.setValue('MENUTYPE', 'APPMENU');
            maxMenu.setValue('MODULEAPP', app);
            maxMenu.setValue('POSITION', position);
            maxMenu.setValue('SUBPOSITION', subPosition);
            maxMenu.setValue('ELEMENTTYPE', 'OPTION');
            maxMenu.setValue('KEYVALUE', optionName);
        } else {
            maxMenu = maxMenuSet.moveFirst();
        }
        maxMenu.setValue('VISIBLE', visible);
        maxMenu.setValue('TABDISPLAY', tabDisplay);

        maxMenuSet.save();
    } finally {
        __libraryClose(maxMenuSet);
    }
}

/**
 * Adds a signature option to the application.
 * @param {String} app The application that the signature options should be added to.
 * @param {String} optionName The signature option name.
 * @param {String} description The description for the signature option.
 * @param {boolean} esigEnabled Indicates that e-signature is enabled.
 * @param {boolean} visible Indicates if the option is visible.
 * @param {String} alsogrants Other options that this option grants.
 * @param {boolean} uiOnly Should the UI be required.
 */
function __addAppOption(
    app,
    optionName,
    description,
    esigEnabled,
    visible,
    alsogrants,
    uiOnly
) {
    var sigOptionSet;

    try {
        sigOptionSet = MXServer.getMXServer().getMboSet(
            'SIGOPTION',
            MXServer.getMXServer().getSystemUserInfo()
        );
        var sqlf = new SqlFormat('app = :1 and optionname = :2');
        sqlf.setObject(1, 'SIGOPTION', 'APP', app);
        sqlf.setObject(2, 'SIGOPTION', 'OPTIONNAME', optionName);
        sigOptionSet.setWhere(sqlf.format());

        var sigOption = sigOptionSet.moveFirst();
        if (!sigOption) {
            sigOption = sigOptionSet.add();
            sigOption.setValue('APP', app);
            sigOption.setValue('OPTIONNAME', optionName);
        }

        sigOption.setValue('DESCRIPTION', description);
        sigOption.setValue('ESIGENABLED', esigEnabled);
        sigOption.setValue('VISIBLE', visible);
        sigOption.setValue('ALSOGRANTS', alsogrants);
        var sigOptFlagSet;

        if (uiOnly) {
            sigOptFlagSet = sigOption.getMboSet('SIGOPTFLAG');
            var sigOptFlag = sigOptFlagSet.moveFirst();
            if (!sigOptFlag) {
                sigOptFlag = sigOptFlagSet.add();
                sigOptFlag.setValue('APP', app);
                sigOptFlag.setValue('OPTIONNAME', optionName);
                sigOptFlag.setValue('FLAGNAME', 'WFACTION');
            }
        } else {
            sigOptFlag = sigOption.getMboSet('SIGOPTFLAG').moveFirst();
            if (sigOptFlag) {
                sigOptFlag.delete();
            }
        }

        sigOptionSet.save();

    } finally {
        __libraryClose(sigOptionSet);
    }
}

function __grantOptionToGroup(group, app, option) {
    var groupSet;
    try {
        var sqlf = new SqlFormat('groupname = :1');
        sqlf.setObject(1, 'MAXGROUP', 'GROUPNAME', group);

        groupSet = MXServer.getMXServer().getMboSet(
            'MAXGROUP',
            MXServer.getMXServer().getSystemUserInfo()
        );
        groupSet.setWhere(sqlf.format());
        var groupMbo;
        if (!groupSet.isEmpty()) {
            groupMbo = groupSet.moveFirst();
            applicationAuthSet = groupMbo.getMboSet('APPLICATIONAUTH');
            sqlf = new SqlFormat('app = :1 and optionname = :2');
            sqlf.setObject(1, 'APPLICATIONAUTH', 'APP', app);
            sqlf.setObject(2, 'APPLICATIONAUTH', 'OPTIONNAME', option);

            applicationAuthSet.setWhere(sqlf.format());
            if (applicationAuthSet.isEmpty()) {
                applicationAuth = applicationAuthSet.add();
                applicationAuth.setValue('APP', app, MboConstants.NOVALIDATION);
                applicationAuth.setValue('OPTIONNAME', option);

                groupSet.save();
            }
        }
    } finally {
        __libraryClose(groupSet);
    }
}

/**
 * 
 * @param {String} name The name of the relationship
 * @param {String} parent The parent of the relationship (source)
 * @param {String} child The child of the relationship (target/destination)
 * @param {String} whereclause Where clause to be used by the relationship
 * @param {String} remarks Description of the relationship
 */
function addOrReplaceRelationship(name, parent, child, whereclause, remarks) {
    var maxRelationshipSet;
    try {
        maxRelationshipSet = MXServer.getMXServer().getMboSet('MAXRELATIONSHIP', MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat('parent = :1 and child = :2 and name = :3');
        sqlf.setObject(1, 'MAXRELATIONSHIP', 'PARENT', parent);
        sqlf.setObject(2, 'MAXRELATIONSHIP', 'CHILD', child);
        sqlf.setObject(3, 'MAXRELATIONSHIP', 'NAME', name);
        maxRelationshipSet.setWhere(sqlf.format());

        if (maxRelationshipSet.isEmpty()) {
            var maxRelationship = maxRelationshipSet.add();
            maxRelationship.setValue('NAME', name);
            maxRelationship.setValue('PARENT', parent);
            maxRelationship.setValue('CHILD', child);
            maxRelationship.setValue('WHERECLAUSE', whereclause);
            maxRelationship.setValue('REMARKS', remarks);
        }
        maxRelationshipSet.save();
    } finally {
        __libraryClose(maxRelationshipSet);
    }
}

/**
 * Cleans up the MboSet connections and closes the set.
 * @param {psdi.mbo.MboSet} set the psdi.mbo.MboSet object to close.
 */
function __libraryClose(set) {
    if (set && set instanceof Java.type('psdi.mbo.MboSet')) {
        try {
            set.cleanup();
            set.close();
        } catch (ignored) { /* ignored */ }
    }
}

var scriptConfig = {
    'autoscript': 'SHARPTREE.AUTOSCRIPT.LIBRARY',
    'description': 'Library Script',
    'version': '',
    'active': true,
    'logLevel': 'ERROR',
};
