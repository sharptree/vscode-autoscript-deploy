/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable indent */
// @ts-nocheck

SqlFormat = Java.type('psdi.mbo.SqlFormat');
MboConstants = Java.type('psdi.mbo.MboConstants');
System = Java.type('java.lang.System');

MXLoggerFactory = Java.type('psdi.util.logging.MXLoggerFactory');
MXServer = Java.type('psdi.server.MXServer');
var logger = MXLoggerFactory.getLogger('maximo.script.SHAPRTREE.AUTOSCRIPT.LIBRARY');


function Message(message) {

    if (!message) {
        throw new Error('A message JSON is required to create the Message object.');
    } else if (typeof message.msgGroup === 'undefined') {
        throw new Error('The msgGroup property is required and must a Maximo Message Group field value.');
    } else if (typeof message.msgKey === 'undefined') {
        throw new Error('The msgKey property is required and must a Maximo Message Key field value.');
    } else if (typeof message.value === 'undefined') {
        throw new Error('The value property is required and must a Maximo Value field value.');
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
        throw new Error('A Mbo is required to set values from the Message object.');
    } else if (!(mbo instanceof Java.type('psdi.mbo.Mbo'))) {
        throw new Error('The mbo parameter must be an instance of psdi.mbo.Mbo.');
    } else if (!mbo.isBasedOn('MAXMESSAGES')) {
        throw new Error('The mbo parameter must be based on the MAXMESSAGES Maximo object.');
    }

    mbo.setValue('MSGGROUP', this.msgGroup);
    mbo.setValue('MSGKEY', this.msgKey);
    mbo.setValue('VALUE', this.value);
    mbo.setValue('DISPLAYMETHOD', this.displayMethod);

    if (this.msgId) {
        mbo.setValue('MSGID', this.msgId);
    } else {
        this.prefix ? mbo.setValue('MSGIDPREFIX', this.prefix) : mbo.setValue('MSGIDPREFIX', 'BMXZZ');
        this.suffix ? mbo.setValue('MSGIDSUFFIX', this.suffix) : mbo.setValue('MSGIDSUFFIX', 'E');
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

/**
 * Deploys the array of messages provided. If a message has the property of delete set to true, that message 
 * will be deleted based on the message's msgId or msgGroup and msgKey.
 * 
 * @param {*} messages A JSON array of messages to be added, updated or deleted
 */
function deployMessages(messages) {
    if (!message || !Array.isArray(message)) {
        throw new Error('The messages parameter is required and must be an array of message objects.');
    }

    logger.debug('Messages: \n' + JSON.stringify(messages, null, 4));

    messages.forEach(function (message) {
        if (typeof message.delete !== 'undefined' && message.delete) {
            deleteMessage(message);
        } else {
            addOrUpdateMessage(message);
        }
    });
}

/**
 * Adds a message if it does not exist or updates it to match the described state if the message exists.
 * @param {*} message single message that will be added/updated
 */
function addOrUpdateMessage(message) {
    logger.debug('addUpdateMessage function called');

    var maxMessageSet;
    try {
        maxMessageSet = MXServer.getMXServer().getMboSet('MAXMESSAGES', MXServer.getMXServer().getSystemUserInfo());
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
 * Removes the provided message by either matching the msgId or if not available, matching the msgGroup and msgKey properties.
 * 
 * @param {*} message single message that will be deleted
 */
function deleteMessage(message) {
    logger.debug(
        'removeMessage function called, passed message ' + message + ' argument'
    );

    if (!message) {
        throw new Error('The message parameter is required for the removeMessage function.');
    }

    var sqlf;

    if (typeof message.msgId !== 'undefined') {
        sqlf = new SqlFormat('msgid = :1');
        sqlf.setObject(1, 'MAXMESSAGES', 'MSGID', message.msgId);
    } else if (typeof message.msgGroup !== 'undefined' && typeof msgKey !== 'undefined') {
        sqlf = new SqlFormat('msggroup = :1 and msgkey = :2');
        sqlf.setObject(1, 'MAXMESSAGES', 'MSGGROUP', message.msgGroup);
        sqlf.setObject(2, 'MAXMESSAGES', 'MSGKEY', message.msgKey);
    }
    var messageSet;
    try {
        messageSet = MXServer.getMXServer().getMboSet('MAXMESSAGES', MXServer.getMXServer().getSystemUserInfo());

        messageSet.setWhere(sqlf.format());

        logger.debug(
            'removeMessage messageSet contains ' + messageSet.count() + ' records'
        );

        messageSet.deleteAll();
        messageSet.save();
        
    } finally {
        __libraryClose(messageSet);
    }
    logger.debug('removeMessage function end');
}

/**
 *
 * @param {*} properties JSON representation of properties to be added/updated
 */
function addUpdateProperties(properties) {
    /*
          assumed structure of properties variable:
          [
              {
                  "propname":"prop1",
                  "description":"first test property",
                  "domainid": null,
                  "encrypted": false,
                  "globalonly": false,
                  "instanceonly": false,
                  "liverefresh":true,
                  "masked": false,
                  "maxtype": "ALN",
                  "nullsallowed": true,
                  "onlinechanges": true,
                  "securelevel": "PUBLIC"
              },
              {
                  "propname":"prop2",
                  "description":"second test property",
                  "domainid": null,
                  "encrypted": false,
                  "globalonly": false,
                  "instanceonly": false,
                  "liverefresh":true,
                  "masked": false,
                  "maxtype": "ALN",
                  "nullsallowed": true,
                  "onlinechanges": true,
                  "securelevel": "PUBLIC"
              }
          ]
      */
    if (
        Array.isArray(properties) &&
        properties !== undefined &&
        properties.length > 0
    ) {
        logger.debug('Properties JSON: ' + JSON.stringify(properties, null, 4));
        properties.forEach(function (property) {
            __addUpdateProperty(property);
        });
    }
}

/**
 *
 * @param {*} property single property that will be added/updated
 */
function __addUpdateProperty(property) {
    logger.debug('addUpdateProperty function called');
    var propName = property.propname;
    var description = property.description;
    var domainid = property.domainid;
    var encrypted = property.encrypted;
    var globalOnly = property.globalonly;
    var instanceOnly = property.instanceonly;
    var liveRefresh = property.liverefresh;
    var masked = property.masked;
    var maxtype = property.maxtype;
    var nullsAllowed = property.nullsallowed;
    var onlineChanges = property.onlinechanges;
    var secureLevel = property.securelevel;
    var propertySet;
    try {
        propertySet = MXServer.getMXServer().getMboSet(
            'MAXPROP',
            MXServer.getMXServer().getSystemUserInfo()
        );
        var sqlf = new SqlFormat('propname = :1');
        sqlf.setObject(1, 'MAXPROP', 'PROPNAME', property.propname);
        propertySet.setWhere(sqlf.format());
        logger.debug('Property set contains ' + propertySet.count() + ' records');
        if (propertySet.isEmpty()) {
            //property does not exist, add
            logger.debug(
                'Property ' +
                property.propname +
                ' does not exist. Adding the property.'
            );
            var property = propertySet.add();
            property.setValue('PROPNAME', propName);
            if (
                description
                    ? property.setValueNull('DESCRIPTION')
                    : property.setValue('DESCRIPTION', description)
            );
            if (
                domainid
                    ? property.setValueNull('DOMAINID')
                    : property.setValue('DOMAINID', domainid)
            );
            if (
                encrypted
                    ? property.setValue('ENCRYPTED', false)
                    : property.setValue('ENCRYPTED', encrypted)
            );
            if (
                globalOnly
                    ? property.setValue('GLOBALONLY', false)
                    : property.setValue('GLOBALONLY', globalOnly)
            );
            if (
                instanceOnly
                    ? property.setValue('INSTANCEONLY', false)
                    : property.setValue('INSTANCEONLY', instanceOnly)
            );
            if (
                liveRefresh
                    ? property.setValue('LIVEREFRESH', true)
                    : property.setValue('LIVEREFRESH', liveRefresh)
            );
            if (
                masked
                    ? property.setValue('MASKED', false)
                    : property.setValue('MASKED', masked)
            );
            if (
                maxtype
                    ? property.setValue('MAXTYPE', 'ALN')
                    : property.setValue('MAXTYPE', maxtype)
            );
            if (
                nullsAllowed
                    ? property.setValue('NULLSALLOWED', true)
                    : property.setValue('NULLSALLOWED', nullsAllowed)
            );
            if (
                onlineChanges
                    ? property.setValue('ONLINECHANGES', true)
                    : property.setValue('ONLINECHANGES', onlineChanges)
            );
            if (
                secureLevel
                    ? property.setValue('SECURELEVEL', 'PUBLIC')
                    : property.setValue('SECURELEVEL', secureLevel)
            );
        } else {
            //property exists, update
            logger.debug(
                'Property ' + property.propname + ' exists. Updating the property.'
            );
            var property = propertySet.moveFirst();
            if (
                description
                    ? logger.debug('Skipping DESCRIPTION set')
                    : property.setValue('DESCRIPTION', description)
            );
            if (
                domainid
                    ? logger.debug('Skipping DOMAINID set')
                    : property.setValue('DOMAINID', domainid)
            );
            if (
                encrypted
                    ? logger.debug('Skipping ENCRYPTED set')
                    : property.setValue('ENCRYPTED', encrypted)
            );
            if (
                globalOnly
                    ? logger.debug('Skipping GLOBALONLY set')
                    : property.setValue('GLOBALONLY', globalOnly)
            );
            if (
                instanceOnly
                    ? logger.debug('Skipping INSTANCEONLY set')
                    : property.setValue('INSTANCEONLY', instanceOnly)
            );
            if (
                liveRefresh
                    ? logger.debug('Skipping LIVEREFRESH set')
                    : property.setValue('LIVEREFRESH', liveRefresh)
            );
            if (
                masked
                    ? logger.debug('Skipping MASKED set')
                    : property.setValue('MASKED', masked)
            );
            if (
                maxtype
                    ? logger.debug('Skipping MAXTYPE set')
                    : property.setValue('MAXTYPE', maxtype)
            );
            if (
                nullsAllowed
                    ? logger.debug('Skipping NULLSALLOWED set')
                    : property.setValue('NULLSALLOWED', nullsAllowed)
            );
            if (
                onlineChanges
                    ? logger.debug('Skipping ONLINECHANGES set')
                    : property.setValue('ONLINECHANGES', onlineChanges)
            );
            if (
                secureLevel
                    ? logger.debug('Skipping SECURELEVEL set')
                    : property.setValue('SECURELEVEL', secureLevel)
            );
        }

        propertySet.save();
    } finally {
        __libraryClose(propertySet);
    }
    logger.debug('addUpdateProperty function end');
}

/**
 *
 * @param {*} propertyValues JSON representation of property values to be added/updated
 */
function addUpdatePropertyValues(propertyValues) {
    /*
          assumed structure of propertyValues variable:
          [
              {
                  "propname":"prop1",
                  "servername":"COMMON",
                  "serverhost":null,
                  "propvalue":"hello",
                  "encryptedvalue":null,
              },
              {
                  "propname":"prop2",
                  "servername":"COMMON",
                  "serverhost":null,
                  "propvalue":"world",
                  "encryptedvalue":null,
              }
          ]
      */
    if (
        Array.isArray(propertyValues) &&
        propertyValues !== undefined &&
        propertyValues.length > 0
    ) {
        logger.debug(
            'Property values JSON: ' + JSON.stringify(propertyValues, null, 4)
        );
        propertyValues.forEach(function (propertyValue) {
            __addUpdatePropertyValue(propertyValue);
        });
    }
}

/**
 *
 * @param {*} propertyValue single property value that will be added/updated
 */
function __addUpdatePropertyValue(propertyValue) {
    logger.debug('addUpdatePropertyValue function called');
    var propName = propertyValue.propname;
    var serverName = propertyValue.servername;
    var serverHost = propertyValue.serverhost;
    var propValue = propertyValue.propvalue;
    var encryptedValue = propertyValue.encryptedvalue;
    var propertyValueSet;
    try {
        propertyValueSet = MXServer.getMXServer().getMboSet(
            'MAXPROPVALUE',
            MXServer.getMXServer().getSystemUserInfo()
        );
        var sqlf = new SqlFormat('propname = :1');
        sqlf.setObject(1, 'MAXPROPVALUE', 'PROPNAME', propertyValue.propname);
        propertyValueSet.setWhere(sqlf.format());
        logger.debug(
            'propertyValueSet contains ' + propertyValueSet.count() + ' records'
        );
        if (propertyValueSet.isEmpty()) {
            //property value does not exist, add
            logger.debug(
                'Property value for property' +
                propertyValue.propname +
                ' does not exist. Adding the property value.'
            );
            var propertyValue = propertyValueSet.add();
            propertyValue.setValue('PROPNAME', propName);
            propertyValue.setValue('SERVERNAME', serverName);
            if (
                serverHost
                    ? propertyValue.setValueNull('SERVERHOST')
                    : propertyValue.setValue('SERVERHOST', serverHost)
            );
            if (
                propValue
                    ? propertyValue.setValueNull('PROPVALUE')
                    : propertyValue.setValue('PROPVALUE', propValue)
            );
            if (
                encryptedValue
                    ? propertyValue.setValueNull('ENCRYPTEDVALUE')
                    : propertyValue.setValue('ENCRYPTEDVALUE', encryptedValue)
            );
        } else {
            //property value exists, update
            logger.debug(
                'Property value for property ' +
                propertyValue.propname +
                ' exists. Updating the property.'
            );
            __removePropertyValue(propertyValue);
            __addUpdatePropertyValue(propertyValue);
        }
        propertyValueSet.save();
    } finally {
        __libraryClose(propertyValueSet);
    }
    logger.debug('addUpdatePropertyValue function end');
}

/**
 *
 * @param {*} properties JSON representation of properties to be deleted
 */
function removeProperties(properties) {
    /*
          assumed structure of properties variable:
          [
              {
                  "propname":"prop1",
                  "description":"first test property",
                  "domainid": null,
                  "encrypted": false,
                  "globalonly": false,
                  "instanceonly": false,
                  "liverefresh":true,
                  "masked": false,
                  "maxtype": "ALN",
                  "nullsallowed": true,
                  "onlinechanges": true,
                  "securelevel": "PUBLIC"
              },
              {
                  "propname":"prop2",
                  "description":"second test property",
                  "domainid": null,
                  "encrypted": false,
                  "globalonly": false,
                  "instanceonly": false,
                  "liverefresh":true,
                  "masked": false,
                  "maxtype": "ALN",
                  "nullsallowed": true,
                  "onlinechanges": true,
                  "securelevel": "PUBLIC"
              }
          ]
      */
    if (
        Array.isArray(properties) &&
        properties !== undefined &&
        properties.length > 0
    ) {
        logger.debug('Properties JSON: ' + JSON.stringify(properties, null, 4));
        properties.forEach(function (property) {
            __removeProperty(property);
        });
    }
}

/**
 *
 * @param {*} property single property that will be deleted
 */
function __removeProperty(property) {
    logger.debug('removeProperty function called');
    var propertySet;
    try {
        propertySet = MXServer.getMXServer().getMboSet(
            'MAXPROP',
            MXServer.getMXServer().getSystemUserInfo()
        );
        var sqlf = new SqlFormat('propname = :1');
        sqlf.setObject(1, 'MAXPROP', 'PROPNAME', property.propname);
        propertySet.setWhere(sqlf.format());

        if (!propertySet.isEmpty()) {
            //property exists, delete
            logger.debug(
                'Property ' + property.propname + ' exists. Deleting the property.'
            );
            var property = propertySet.moveFirst();
            property.delete();
        } else {
            //property does not exist
            logger.debug(
                'Property ' + property.propname + ' does not exist. Taking no action.'
            );
        }

        propertySet.save();
    } finally {
        __libraryClose(propertySet);
    }
    logger.debug('removeProperty function end');
}

/**
 *
 * @param {*} propertyValues JSON representation of property values to be deleted
 */
function removePropertyValues(propertyValues) {
    /*
          assumed structure of propertyValues variable:
          [
              {
                  "propname":"prop1",
                  "servername":"COMMON",
                  "serverhost":null,
                  "propvalue":"hello",
                  "encryptedvalue":null,
              },
              {
                  "propname":"prop2",
                  "servername":"COMMON",
                  "serverhost":null,
                  "propvalue":"world",
                  "encryptedvalue":null,
              }
          ]
      */
    if (
        Array.isArray(propertyValues) &&
        propertyValues !== undefined &&
        propertyValues.length > 0
    ) {
        logger.debug(
            'Property values JSON: ' + JSON.stringify(propertyValues, null, 4)
        );
        propertyValues.forEach(function (propertyValue) {
            __removePropertyValue(propertyValue);
        });
    }
}

/**
 *
 * @param {*} propertyValue single property value that will be deleted
 */
function __removePropertyValue(propertyValue) {
    logger.debug('removePropertyValue function called');
    var propertyValueSet;
    try {
        propertyValueSet = MXServer.getMXServer().getMboSet(
            'MAXPROPVALUE',
            MXServer.getMXServer().getSystemUserInfo()
        );
        var sqlf = new SqlFormat('propname = :1');
        sqlf.setObject(1, 'MAXPROPVALUE', 'PROPNAME', propertyValue.propname);
        propertyValueSet.setWhere(sqlf.format());
        logger.debug(
            'propertyValueSet contains ' + propertyValueSet.count() + ' records'
        );
        if (!propertyValueSet.isEmpty()) {
            //property value exists, delete
            logger.debug(
                'Property value for property' +
                propertyValue.propname +
                ' exists. Deleting the property value.'
            );
            var propertyValue = propertyValueSet.moveFirst();
            propertyValue.delete();
        } else {
            //property value does not exist, do nothing
            logger.debug(
                'Property value for property ' +
                propertyValue.propname +
                ' does not exist. Taking no action.'
            );
        }
        propertyValueSet.save();
    } finally {
        __libraryClose(propertyValueSet);
    }
    logger.debug('removePropertyValue function end');
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

        if (uiOnly) {
            var sigOptFlagSet = sigOption.getMboSet('SIGOPTFLAG');
            var sigOptFlag = sigOptFlagSet.moveFirst();
            if (!sigOptFlag) {
                sigOptFlag = sigOptFlagSet.add();
                sigOptFlag.setValue('APP', app);
                sigOptFlag.setValue('OPTIONNAME', optionName);
                sigOptFlag.setValue('FLAGNAME', 'WFACTION');
            }
        } else {
            var sigOptFlag = sigOption.getMboSet('SIGOPTFLAG').moveFirst();
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
function __addRelationship(name, parent, child, whereclause, remarks) {
    var maxRelationshipSet;
    try {
        maxRelationshipSet = MXServer.getMXServer().getMboSet(
            'MAXRELATIONSHIP',
            MXServer.getMXServer().getSystemUserInfo()
        );
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

// Cleans up the MboSet connections and closes the set.
function __libraryClose(set) {
    if (set) {
        try {
            set.cleanup();
            set.close();
            // eslint-disable-next-line no-empty
        } catch (ignored) { }
    }
}

// eslint-disable-next-line no-unused-vars
var scriptConfig = {
    'autoscript': 'SHARPTREE.AUTOSCRIPT.LIBRARY',
    'description': 'Library Script',
    'version': '',
    'active': true,
    'logLevel': 'ERROR'
};