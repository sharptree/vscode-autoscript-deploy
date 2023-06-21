/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
// @ts-nocheck

SqlFormat = Java.type('psdi.mbo.SqlFormat');
MboConstants = Java.type("psdi.mbo.MboConstants");
System = Java.type("java.lang.System");

MXLoggerFactory = Java.type("psdi.util.logging.MXLoggerFactory");
MXServer = Java.type('psdi.server.MXServer');
var logger = MXLoggerFactory.getLogger("maximo.script.SHAPRTREE.AUTOSCRIPT.LIBRARY");



/**
 * 
 * @param {*} messages JSON representation of messages to be added/updated
 */
function __addUpdateMessages(messages){
    /*
        assumed structure of messages variable:
        [
            {
                "msggroup":"test",
                "msgkey":"testmessage1",
                "value":"This is the first message being added"
            },
            {
                "msggroup":"test1",
                "msgkey":"testmessage2",
                "value":"This is the second message being added"
            }
        ]
    */
   logger.debug("Messages JSON: " + JSON.stringify(messages));
   messages.forEach(function(message){
    __addUpdateMessage(message);
   });

}

/**
 * 
 * @param {*} message single message that will be added/updated
 */
function __addUpdateMessage(message){
    logger.debug("addUpdateMessage function called");
    var group = message.msggroup;
    var key = message.msgkey;
    var value = message.value;
    logger.debug("message group: " + group);
    logger.debug("message key:   " + key);
    logger.debug("message value: " + value);
    var messageSet;
    try {
        //search for updates for the messages
        //search for matching key and group, but not value. Update value
        logger.debug("Searching for messages matching the group and key, but not the value");
        messageSet = MXServer.getMXServer().getMboSet("MAXMESSAGES", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("msggroup = :1 and msgkey = :2 and value != :3");
        sqlf.setObject(1, "MAXMESSAGES", "MSGGROUP", group);
        sqlf.setObject(2, "MAXMESSAGES", "MSGKEY", key);
        sqlf.setObject(3, "MAXMESSAGES", "VALUE", value);
        messageSet.setWhere(sqlf.format());
        logger.debug("messages set returned " + messageSet.count() + " records");
        if(!messageSet.isEmpty() && messageSet.count() == 1){
            logger.debug("A message record was found matching the MSGGROUP and MSGKEY of the passed record. Updating the VALUE of the record.");
            var messageMbo = messageSet.getMbo(0);
            messageMbo.setValue("VALUE", value);
        }
        messageSet.save();

        //add the message if it doesn't exist
        logger.debug("Update check complete. Determining if message should be added.");
        messageSet = MXServer.getMXServer().getMboSet("MAXMESSAGES", MXServer.getMXServer().getSystemUserInfo());
        sqlf = new SqlFormat("msggroup = :1 and msgkey = :2 and value = :3");
        sqlf.setObject(1, "MAXMESSAGES", "MSGGROUP",group);
        sqlf.setObject(2, "MAXMESSAGES", "MSGKEY", key);
        sqlf.setObject(3, "MAXMESSAGES", "VALUE", value);
        messageSet.setWhere(sqlf.format());
        if(messageSet.isEmpty()){
            logger.debug("The message set returned 0 results when searching for the passed message. Adding new message.");
            //new message
            //get the record with the highest msgid
            messageSet = MXServer.getMXServer().getMboSet("MAXMESSAGES", MXServer.getMXServer().getSystemUserInfo());
            var sqlf = new SqlFormat("msgid like 'BMXZZ%'");
            messageSet.setWhere(sqlf.format());
            messageSet.setOrderBy("MAXMESSAGESID desc");
            var maxMSGIDmessage = messageSet.moveFirst();
            var maxMSGID = maxMSGIDmessage.getString("MSGID");
            logger.debug("Max message ID before formatting is " + maxMSGID);
            maxMSGID = maxMSGID.substring(5,maxMSGID.length-1);
            logger.debug("Max message ID is " + maxMSGID);
            var messageMbo = messageSet.add();
            messageMbo.setValue("MSGGROUP", group);
            messageMbo.setValue("MSGKEY", key);
            messageMbo.setValue("VALUE", value);
            messageMbo.setValue("MSGID", "BMXZZ" + (parseInt(maxMSGID)+1) + "E");
            messageMbo.setValue("DISPLAYMETHOD", "MSGBOX");
            messageMbo.setValue("OPTIONS", 2);
        }
        messageSet.save();
    } finally {
        __close(messageSet);
    }
    logger.debug("addUpdateMessage function end");
}

/**
 * 
 * @param {*} messages JSON representation of messages to be deleted
 */
function __removeMessages(messages){
    /*
        assumed structure of messages variable:
        [
            {
                "msggroup":"test",
                "msgkey":"testmessage1",
                "value":"This is the first message being added"
            },
            {
                "msggroup":"test1",
                "msgkey":"testmessage2",
                "value":"This is the second message being added"
            }
        ]
    */
   logger.debug("Messages JSON: " + JSON.stringify(messages));
   messages.forEach(function(message){
    __removeMessage(message);
   });
}

/**
 * 
 * @param {*} message single message that will be deleted
 */
function __removeMessage(message){
    logger.debug("removeMessage function called, passed message " + message + " argument");
    var messageSet;
    try {
        messageSet = MXServer.getMXServer().getMboSet("MAXMESSAGES", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("msggroup = :1 and msgkey = :2 and value = :3");
        sqlf.setObject(1, "MAXMESSAGES", "MSGGROUP", message.msggroup);
        sqlf.setObject(2, "MAXMESSAGES", "MSGKEY", message.msgkey);
        sqlf.setObject(3, "MAXMESSAGES", "VALUE", message.value);
        messageSet.setWhere(sqlf.format());
        logger.debug("removeMessage messageSet contains " + messageSet.count() + " records");
        if(!messageSet.isEmpty() && messageSet.count() == 1){
            var messageMbo = messageSet.moveFirst();
            logger.debug("Removing message with group=" + messageMbo.getString("MSGGROUP") + ", key=" + messageMbo.getString("MSGKEY") + ", value=" + messageMbo.getString("VALUE"));
            messageMbo.delete();
        }
        else{
            logger.debug("removeMessage function found no matching messages. No action taken.");
        }
        messageSet.save();
    }
    finally{
        __close(messageSet);
    }
    logger.debug("removeMessage function end");
}

/**
 * 
 * @param {*} properties JSON representation of properties to be added/updated
 */
function __addUpdateProperties(properties){
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
   logger.debug("Properties JSON: " + JSON.stringify(properties));
   properties.forEach(function(property){
    __addUpdateProperty(property);
   });
}

/**
 * 
 * @param {*} property single property that will be added/updated
 */
function __addUpdateProperty(property){
    logger.debug("addUpdateProperty function called");
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
        propertySet = MXServer.getMXServer().getMboSet("MAXPROP", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("propname = :1");
        sqlf.setObject(1, "MAXPROP", "PROPNAME", property.propname);
        propertySet.setWhere(sqlf.format());
        logger.debug("Property set contains " + propertySet.count() + " records");
        if(propertySet.isEmpty()){
            //property does not exist, add
            logger.debug("Property " + property.propname + " does not exist. Adding the property.");
            var property = propertySet.add();
            property.setValue("PROPNAME", propName);
            if(description==null?property.setValueNull("DESCRIPTION"):property.setValue("DESCRIPTION", description));
            if(domainid==null?property.setValueNull("DOMAINID"):property.setValue("DOMAINID", domainid));
            if(encrypted==null?property.setValue("ENCRYPTED",false):property.setValue("ENCRYPTED", encrypted));
            if(globalOnly==null?property.setValue("GLOBALONLY",false):property.setValue("GLOBALONLY", globalOnly));
            if(instanceOnly==null?property.setValue("INSTANCEONLY",false):property.setValue("INSTANCEONLY", instanceOnly));
            if(liveRefresh==null?property.setValue("LIVEREFRESH",true):property.setValue("LIVEREFRESH", liveRefresh));
            if(masked==null?property.setValue("MASKED",false):property.setValue("MASKED", masked));
            if(maxtype==null?property.setValue("MAXTYPE","ALN"):property.setValue("MAXTYPE", maxtype));
            if(nullsAllowed==null?property.setValue("NULLSALLOWED",true):property.setValue("NULLSALLOWED", nullsAllowed));
            if(onlineChanges==null?property.setValue("ONLINECHANGES",true):property.setValue("ONLINECHANGES", onlineChanges));
            if(secureLevel==null?property.setValue("SECURELEVEL","PUBLIC"):property.setValue("SECURELEVEL", secureLevel));
        }
        else{
            //property exists, update
            logger.debug("Property " + property.propname + " exists. Updating the property.");
            var property = propertySet.moveFirst();
            if(description==null?logger.debug("Skipping DESCRIPTION set"):property.setValue("DESCRIPTION", description));
            if(domainid==null?logger.debug("Skipping DOMAINID set"):property.setValue("DOMAINID", domainid));
            if(encrypted==null?logger.debug("Skipping ENCRYPTED set"):property.setValue("ENCRYPTED", encrypted));
            if(globalOnly==null?logger.debug("Skipping GLOBALONLY set"):property.setValue("GLOBALONLY", globalOnly));
            if(instanceOnly==null?logger.debug("Skipping INSTANCEONLY set"):property.setValue("INSTANCEONLY", instanceOnly));
            if(liveRefresh==null?logger.debug("Skipping LIVEREFRESH set"):property.setValue("LIVEREFRESH", liveRefresh));
            if(masked==null?logger.debug("Skipping MASKED set"):property.setValue("MASKED", masked));
            if(maxtype==null?logger.debug("Skipping MAXTYPE set"):property.setValue("MAXTYPE", maxtype));
            if(nullsAllowed==null?logger.debug("Skipping NULLSALLOWED set"):property.setValue("NULLSALLOWED", nullsAllowed));
            if(onlineChanges==null?logger.debug("Skipping ONLINECHANGES set"):property.setValue("ONLINECHANGES", onlineChanges));
            if(secureLevel==null?logger.debug("Skipping SECURELEVEL set"):property.setValue("SECURELEVEL", secureLevel));
        }
        
        propertySet.save();
    }
    finally{
        __close(propertySet);
    }
    logger.debug("addUpdateProperty function end");
}

/**
 * 
 * @param {*} propertyValues JSON representation of property values to be added/updated
 */
function __addUpdatePropertyValues(propertyValues){
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
    logger.debug("Property values JSON: " + JSON.stringify(propertyValues));
    propertyValues.forEach(function(propertyValue){
    __addUpdatePropertyValue(propertyValue);
   });
}

/**
 * 
 * @param {*} propertyValue single property value that will be added/updated
 */
function __addUpdatePropertyValue(propertyValue){
    logger.debug("addUpdatePropertyValue function called");
    var propName = propertyValue.propname;
    var serverName = propertyValue.servername;
    var serverHost = propertyValue.serverhost;
    var propValue = propertyValue.propvalue;
    var encryptedValue = propertyValue.encryptedvalue;
    var propertyValueSet;
    try {
        propertyValueSet = MXServer.getMXServer().getMboSet("MAXPROPVALUE", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("propname = :1");
        sqlf.setObject(1, "MAXPROPVALUE", "PROPNAME", propertyValue.propname);
        propertyValueSet.setWhere(sqlf.format());
        logger.debug("propertyValueSet contains " + propertyValueSet.count() + " records");
        if(propertyValueSet.isEmpty()){
            //property value does not exist, add
            logger.debug("Property value for property" + propertyValue.propname + " does not exist. Adding the property value.");
            var propertyValue = propertyValueSet.add();
            propertyValue.setValue("PROPNAME", propName);
            propertyValue.setValue("SERVERNAME", serverName);
            if(serverHost==null?propertyValue.setValueNull("SERVERHOST"):propertyValue.setValue("SERVERHOST", serverHost));
            if(propValue==null?propertyValue.setValueNull("PROPVALUE"):propertyValue.setValue("PROPVALUE", propValue));
            if(encryptedValue==null?propertyValue.setValueNull("ENCRYPTEDVALUE"):propertyValue.setValue("ENCRYPTEDVALUE", encryptedValue));
        }
        else{
            //property value exists, update
            logger.debug("Property value for property " + propertyValue.propname + " exists. Updating the property.");
            __removePropertyValue(propertyValue);
            __addUpdatePropertyValue(propertyValue);
        }
        propertyValueSet.save();
    }
    finally{
        __close(propertyValueSet);
    }
    logger.debug("addUpdatePropertyValue function end");
}

/**
 * 
 * @param {*} properties JSON representation of properties to be deleted
 */
function __removeProperties(properties){
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
    logger.debug("Properties JSON: " + JSON.stringify(properties));
    properties.forEach(function(property){
        __removeProperty(property);
   });
}

/**
 * 
 * @param {*} property single property that will be deleted
 */
function __removeProperty(property){
    logger.debug("removeProperty function called");
    var propertySet;
    try {
        propertySet = MXServer.getMXServer().getMboSet("MAXPROP", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("propname = :1");
        sqlf.setObject(1, "MAXPROP", "PROPNAME", property.propname);
        propertySet.setWhere(sqlf.format());

        if(!propertySet.isEmpty()){
            //property exists, delete
            logger.debug("Property " + property.propname + " exists. Deleting the property.");
            var property = propertySet.moveFirst();
            property.delete();
        }
        else{
            //property does not exist
            logger.debug("Property " + property.propname + " does not exist. Taking no action.");
        }
        
        propertySet.save();
    }
    finally{
        __close(propertySet);
    }
    logger.debug("removeProperty function end");
}

/**
 * 
 * @param {*} propertyValues JSON representation of property values to be deleted
 */
function __removePropertyValues(propertyValues){
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
    logger.debug("Property values JSON: " + JSON.stringify(propertyValues));
    propertyValues.forEach(function(propertyValue){
    __removePropertyValue(propertyValue);
   });
}

/**
 * 
 * @param {*} propertyValue single property value that will be deleted
 */
function __removePropertyValue(propertyValue){
    logger.debug("removePropertyValue function called");
    var propertyValueSet;
    try {
        propertyValueSet = MXServer.getMXServer().getMboSet("MAXPROPVALUE", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("propname = :1");
        sqlf.setObject(1, "MAXPROPVALUE", "PROPNAME", propertyValue.propname);
        propertyValueSet.setWhere(sqlf.format());
        logger.debug("propertyValueSet contains " + propertyValueSet.count() + " records");
        if(!propertyValueSet.isEmpty()){
            //property value exists, delete
            logger.debug("Property value for property" + propertyValue.propname + " exists. Deleting the property value.");
            var propertyValue = propertyValueSet.moveFirst();
            propertyValue.delete();
        }
        else{
            //property value does not exist, do nothing
            logger.debug("Property value for property " + propertyValue.propname + " does not exist. Taking no action.");
        }
        propertyValueSet.save();
    }
    finally{
        __close(propertyValueSet);
    }
    logger.debug("removePropertyValue function end");
}


/**
 * Adds or updates a logger. This relies on the calling function calling save on the provided parent MboSet to save the changes.
 * 
 * @param {*} loggerName The logger to add.
 * @param {*} level The log level to set the logger at.
 * @param {*} parent The parent logger to add the child logger to.
 */
function __addLoggerIfDoesNotExist(loggerName, level, parent) {
    logger.debug("Adding or updating the logger " + loggerName + " and setting the level to " + level + ".");
    var loggerSet;
    try {
        loggerSet = MXServer.getMXServer().getMboSet("MAXLOGGER", MXServer.getMXServer().getSystemUserInfo());

        // Query for the log key
        var sqlFormat = new SqlFormat("logkey = :1");
        sqlFormat.setObject(1, "MAXLOGGER", "LOGKEY", parent.getString("LOGKEY") + "." + loggerName);

        loggerSet.setWhere(sqlFormat.format());
        var child;
        // if the logkey does not exist create it, otherwise get the existing logger and update its level.
        if (loggerSet.isEmpty()) {
            child = parent.getMboSet("CHILDLOGGERS").add();
            child.setValue("LOGGER", loggerName);
            child.setValue("LOGLEVEL", level);
            logger.debug("Added the logger " + loggerName + " and set the level to " + level + ".");
        }
    } finally {
        __close(loggerSet);
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
function __addMenu(app, optionName, below, visible, tabDisplay){
    var maxMenuSet;
    var maxMenu;
    try{
        maxMenuSet = MXServer.getMXServer().getMboSet("MAXMENU", MXServer.getMXServer().getSystemUserInfo());
        

        var position = 0;
        var subPosition = 0;
        if(below){
            var sqlf = new SqlFormat("moduleapp = :1 and elementtype = :2 and keyvalue = :3");
            sqlf.setObject(1, "MAXMENU", "MODULEAPP", app);
            sqlf.setObject(2, "MAXMENU", "ELEMENTTYPE", "OPTION");
            sqlf.setObject(3, "MAXMENU", "KEYVALUE", below);

            maxMenuSet.setWhere(sqlf.format());
            maxMenu = maxMenuSet.moveFirst();

            if(maxMenu){
                if(!maxMenu.isNull("SUBPOSITION")){
                    position = maxMenu.getInt("POSITION");
                    subPosition = maxMenu.getInt("SUBPOSITION") + 1;
                }else{
                    position = maxMenu.getInt("POSITION") + 1; 
                }
            }
        }

        if(position == 0){
            sqlf = new SqlFormat("moduleapp = :1 and elementtype = :2");
            sqlf.setObject(1, "MAXMENU", "MODULEAPP", app);
            sqlf.setObject(2, "MAXMENU", "ELEMENTTYPE", "OPTION");

            maxMenuSet.setWhere(sqlf.format());
            maxMenuSet.setOrderBy("position desc");
            maxMenuSet.reset();
            maxMenu = maxMenuSet.moveFirst();
            position = maxMenu.getInt("POSITION") + 1;        
        }

        sqlf = new SqlFormat("moduleapp = :1 and elementtype = :2 and keyvalue = :3");
        sqlf.setObject(1, "MAXMENU", "MODULEAPP", app);
        sqlf.setObject(2, "MAXMENU", "ELEMENTTYPE", "OPTION");
        sqlf.setObject(3, "MAXMENU", "KEYVALUE", optionName);

        maxMenuSet.setWhere(sqlf.format());
        maxMenuSet.reset();
        
        if(maxMenuSet.isEmpty()){
            maxMenu = maxMenuSet.add();
            maxMenu.setValue("MENUTYPE", "APPMENU");
            maxMenu.setValue("MODULEAPP", app);
            maxMenu.setValue("POSITION", position);
            maxMenu.setValue("SUBPOSITION", subPosition);
            maxMenu.setValue("ELEMENTTYPE", "OPTION");
            maxMenu.setValue("KEYVALUE", optionName);            
        }else{
            maxMenu = maxMenuSet.moveFirst();
        }
        maxMenu.setValue("VISIBLE", visible);   
        maxMenu.setValue("TABDISPLAY", tabDisplay);   

        maxMenuSet.save();
    }finally{
        __close(maxMenuSet);
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
function __addAppOption(app, optionName, description, esigEnabled, visible, alsogrants, uiOnly){
    var sigOptionSet;
    
    try{
        sigOptionSet = MXServer.getMXServer().getMboSet("SIGOPTION", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("app = :1 and optionname = :2");
        sqlf.setObject(1, "SIGOPTION", "APP", app);
        sqlf.setObject(2, "SIGOPTION", "OPTIONNAME", optionName);
        sigOptionSet.setWhere(sqlf.format());
        
        var sigOption = sigOptionSet.moveFirst();
        if(!sigOption){
            sigOption = sigOptionSet.add();
            sigOption.setValue("APP", app);
            sigOption.setValue("OPTIONNAME", optionName);
        }

        sigOption.setValue("DESCRIPTION", description);
        sigOption.setValue("ESIGENABLED", esigEnabled);
        sigOption.setValue("VISIBLE", visible);
        sigOption.setValue("ALSOGRANTS", alsogrants);

        if(uiOnly){
            var sigOptFlagSet = sigOption.getMboSet("SIGOPTFLAG");
            var sigOptFlag = sigOptFlagSet.moveFirst();
            if(!sigOptFlag){
                sigOptFlag = sigOptFlagSet.add();
                sigOptFlag.setValue("APP", app);
                sigOptFlag.setValue("OPTIONNAME", optionName);
                sigOptFlag.setValue("FLAGNAME", "WFACTION");
            }
        }else{
            var sigOptFlag = sigOption.getMboSet("SIGOPTFLAG").moveFirst();
            if(sigOptFlag){
                sigOptFlag.delete();
            }
        }
        sigOptionSet.save();
        
    }finally{
        __close(sigOptionSet);
    }
}

function __grantOptionToGroup(group, app, option) {

    var groupSet;
    try {
        var sqlf = new SqlFormat("groupname = :1");
        sqlf.setObject(1, "MAXGROUP", "GROUPNAME", group);

        groupSet = MXServer.getMXServer().getMboSet("MAXGROUP", MXServer.getMXServer().getSystemUserInfo());
        groupSet.setWhere(sqlf.format());
        var groupMbo;
        if (!groupSet.isEmpty()) {
            groupMbo = groupSet.moveFirst();
            applicationAuthSet = groupMbo.getMboSet("APPLICATIONAUTH");
            sqlf = new SqlFormat("app = :1 and optionname = :2");
            sqlf.setObject(1, "APPLICATIONAUTH", "APP", app);
            sqlf.setObject(2, "APPLICATIONAUTH", "OPTIONNAME", option);

            applicationAuthSet.setWhere(sqlf.format());
            if (applicationAuthSet.isEmpty()) {
                applicationAuth = applicationAuthSet.add();
                applicationAuth.setValue("APP", app, MboConstants.NOVALIDATION);
                applicationAuth.setValue("OPTIONNAME", option);

                groupSet.save();
            }
        }
    } finally {
        __close(groupSet);
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
function __addRelationship(name, parent, child, whereclause, remarks){
    var maxRelationshipSet;
    try {
        maxRelationshipSet = MXServer.getMXServer().getMboSet("MAXRELATIONSHIP", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("parent = :1 and child = :2 and name = :3");
        sqlf.setObject(1, "MAXRELATIONSHIP", "PARENT", parent);
        sqlf.setObject(2, "MAXRELATIONSHIP", "CHILD", child);
        sqlf.setObject(3, "MAXRELATIONSHIP", "NAME", name);
        maxRelationshipSet.setWhere(sqlf.format());

        if(maxRelationshipSet.isEmpty()){
            var maxRelationship = maxRelationshipSet.add();
            maxRelationship.setValue("NAME", name);
            maxRelationship.setValue("PARENT", parent);
            maxRelationship.setValue("CHILD", child);
            maxRelationship.setValue("WHERECLAUSE", whereclause);
            maxRelationship.setValue("REMARKS", remarks);
        }
        maxRelationshipSet.save();
    } finally {
        __close(maxRelationshipSet);
    }
}

// Cleans up the MboSet connections and closes the set.
function __close(set) {
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