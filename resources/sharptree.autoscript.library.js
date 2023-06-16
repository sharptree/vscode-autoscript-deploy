/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
// @ts-nocheck

SqlFormat = Java.type('psdi.mbo.SqlFormat');

MXServer = Java.type('psdi.server.MXServer');

/**
 * 
 * @param {*} messages JSON representation of messages to be added/updated
 */
function __addUpdateMessages(messages){
    /*
        assumed structure of messages variable:
        [
            {
                "msggroup":"msggroup",
                "msgkey":"msgkey",
                "value":"value"
            },
            {
                "msggroup":"msggroup",
                "msgkey":"msgkey",
                "value":"value"
            }
        ]
    */
   service.debug("Messages JSON: " + messages);
   messages.forEach(function(message){
        __addUpdateMessages(message);
   });
}

/**
 * 
 * @param {*} message single message that will be added/updated
 */
function __addUpdateMessage(message){
    service.debug("addUpdateMessage function called, passed message " + message + " argument");
    var messageSet;
    try {
        messageSet = MXServer.getMXServer().getMboSet("MAXMESSAGES", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("msggroup = :1 and msgkey = :2 and value = :3");
        sqlf.setObject(1, "MAXMESSAGES", "MSGGROUP", message.msggroup);
        sqlf.setObject(2, "MAXMESSAGES", "MSGKEY", message.msgkey);
        sqlf.setObject(3, "MAXMESSAGES", "VALUE", message.value);
        messageSet.setWhere(sqlf.format());

        if(messageSet.isEmpty()){
            //new message
            service.debug("The message set returned 0 results when searching for the passed message. Adding new message.");
            var message = messageSet.add();
            message.setValue("MSGGROUP", message.msggroup);
            message.setValue("MSGKEY", message.msgkey);
            message.setValue("VALUE", message.value);
        }
        else{
            //update message
            service.debug("The message set returned a result when searching for the passed message. Updating a message record");
            messageSet.reset();
            //search for matching key and group, but not value. Update value
            sqlf = new SqlFormat("msggroup = :1 and msgkey = :2 and value != :3");
            sqlf.setObject(1, "MAXMESSAGES", "MSGGROUP", message.msggroup);
            sqlf.setObject(2, "MAXMESSAGES", "MSGKEY", message.msgkey);
            sqlf.setObject(3, "MAXMESSAGES", "VALUE", message.value);
            messageSet.setWhere(sqlf.format());
            if(messageSet.isEmpty() && messageSet.count() == 1){
                service.debug("A message record was found matching the MSGGROUP and MSGKEY of the passed record. Updating the VALUE of the record.");
                var message = messageSet.getMbo(0);
                message.setValue("VALUE", message.value);
            }
            messageSet.save();
            //search for matching key and value, but not group. Update group
            messageSet = MXServer.getMXServer().getMboSet("MAXMESSAGES", MXServer.getMXServer().getSystemUserInfo());
            sqlf = new SqlFormat("msggroup != :1 and msgkey = :2 and value = :3");
            sqlf.setObject(1, "MAXMESSAGES", "MSGGROUP", message.msggroup);
            sqlf.setObject(2, "MAXMESSAGES", "MSGKEY", message.msgkey);
            sqlf.setObject(3, "MAXMESSAGES", "VALUE", message.value);
            messageSet.setWhere(sqlf.format());
            if(messageSet.isEmpty() && messageSet.count() == 1){
                service.debug("A message record was found matching the MSGKEY and VALUE of the passed record. Updating the MSGGROUP of the record.");
                var message = messageSet.moveFirst();
                message.setValue("MSGROUP", message.msggroup);
            }
            messageSet.save();
            //search for matching group and value, but not key. Update key
            messageSet = MXServer.getMXServer().getMboSet("MAXMESSAGES", MXServer.getMXServer().getSystemUserInfo());
            sqlf = new SqlFormat("msggroup = :1 and msgkey != :2 and value = :3");
            sqlf.setObject(1, "MAXMESSAGES", "MSGGROUP", message.msggroup);
            sqlf.setObject(2, "MAXMESSAGES", "MSGKEY", message.msgkey);
            sqlf.setObject(3, "MAXMESSAGES", "VALUE", message.value);
            messageSet.setWhere(sqlf.format());
            if(messageSet.isEmpty() && messageSet.count() == 1){
                service.debug("A message record was found matching the MSGGROUP and VALUE of the passed record. Updating the MSGKEY of the record.");
                var message = messageSet.moveFirst();
                message.setValue("MSGKEY", message.msgkey);
            }

        }
        messageSet.save();
    } finally {
        __close(messageSet);
    }
    service.debug("addUpdateMessage function end");
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
                "msggroup":"msggroup",
                "msgkey":"msgkey",
                "value":"value"
            },
            {
                "msggroup":"msggroup",
                "msgkey":"msgkey",
                "value":"value"
            }
        ]
    */
   service.debug("Messages JSON: " + messages);
   messages.forEach(function(message){
        __removeMessage(message);
   });
}

/**
 * 
 * @param {*} message single message that will be deleted
 */
function __removeMessage(message){
    service.debug("removeMessage function called, passed message " + message + " argument");
    var messageSet;
    try {
        messageSet = MXServer.getMXServer().getMboSet("MAXMESSAGES", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("msggroup = :1 and msgkey = :2 and value = :3");
        sqlf.setObject(1, "MAXMESSAGES", "MSGGROUP", message.msggroup);
        sqlf.setObject(2, "MAXMESSAGES", "MSGKEY", message.msgkey);
        sqlf.setObject(3, "MAXMESSAGES", "VALUE", message.value);
        messageSet.setWhere(sqlf.format());

        if(!messageSet.isEmpty()){
            var message = messageSet.moveFirst();
            message.delete();
        }
        else{
            service.debug("removeMessage function found no matching messages. No action taken.");
        }
        messageSet.save();
    }
    finally{
        __close(messageSet);
    }
    service.debug("removeMessage function end");
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
                "propname":"propname",
                "description":"description",
                "domainid":"domainid",
                "encrypted":"encrypted",
                "fileoverride":"fileoverride",
                "globalonly":"globalonly",
                "instanceonly":"instanceonly",
                "liverefresh":"liverefresh",
                "masked":"masked",
                "maxtype":"maxtype",
                "nullsallowed":"nullsallowed",
                "onlinechanges":"onlinechanges",
                "securelevel":"securelevel"
            },
            {
                "propname":"propname",
                "description":"description",
                "domainid":"domainid",
                "encrypted":"encrypted",
                "fileoverride":"fileoverride",
                "globalonly":"globalonly",
                "instanceonly":"instanceonly",
                "liverefresh":"liverefresh",
                "masked":"masked",
                "maxtype":"maxtype",
                "nullsallowed":"nullsallowed",
                "onlinechanges":"onlinechanges",
                "securelevel":"securelevel"
            }
        ]
    */
   service.debug("Properties JSON: " + properties);
   properties.forEach(function(property){
    __addUpdateProperty(property);
   });
}

/**
 * 
 * @param {*} property single property that will be added/updated
 */
function __addUpdateProperty(property){
    service.debug("addUpdateProperty function called, passed message " + property + " argument");
    var propertySet;
    try {
        propertySet = MXServer.getMXServer().getMboSet("MAXPROP", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("propname = :1");
        sqlf.setObject(1, "MAXPROP", "PROPNAME", property.propname);
        propertySet.setWhere(sqlf.format());

        if(propertySet.isEmpty()){
            //property does not exist, add
            service.debug("Property " + property.propname + " does not exist. Adding the property.");
            var property = propertySet.add();
            property.setValue("PROPNAME", property.propname);
            property.setValue("DESCRIPTION", property.description);
            property.setValue("DOMAINID", property.domainid);
            property.setValue("ENCRYPTED", property.encrypted);
            property.setValue("FILEOVERRIDE", property.fileoverride);
            property.setValue("GLOBALONLY", property.globalonly);
            property.setValue("INSTANCEONLY", property.instanceonly);
            property.setValue("LIVEREFRESH", property.liverefresh);
            property.setValue("MASKED", property.masked);
            property.setValue("MAXTYPE", property.maxtype);
            property.setValue("NULLSALLOWED", property.nullsallowed);
            property.setValue("ONLINECHANGES", property.onlinechanges);
            property.setValue("SECURELEVEL", property.securelevel);
        }
        else{
            //property exists, update
            service.debug("Property " + property.propname + " exists. Updating the property.");
            var property = propertySet.moveFirst();
            property.setValue("DESCRIPTION", property.description);
            property.setValue("DOMAINID", property.domainid);
            property.setValue("ENCRYPTED", property.encrypted);
            property.setValue("FILEOVERRIDE", property.fileoverride);
            property.setValue("GLOBALONLY", property.globalonly);
            property.setValue("INSTANCEONLY", property.instanceonly);
            property.setValue("LIVEREFRESH", property.liverefresh);
            property.setValue("MASKED", property.masked);
            property.setValue("MAXTYPE", property.maxtype);
            property.setValue("NULLSALLOWED", property.nullsallowed);
            property.setValue("ONLINECHANGES", property.onlinechanges);
            property.setValue("SECURELEVEL", property.securelevel);
        }
        
        propertySet.save();
    }
    finally{
        __close(propertySet);
    }
    service.debug("addUpdateProperty function end");
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
                "propname":"propname",
                "servername":"servername",
                "serverhost":"serverhost",
                "propvalue":"propvalue",
                "encryptedvalue":"encryptedvalue",
            },
            {
                "propname":"propname",
                "servername":"servername",
                "serverhost":"serverhost",
                "propvalue":"propvalue",
                "encryptedvalue":"encryptedvalue",
            }
        ]
    */
    service.debug("Property values JSON: " + propertyValues);
    propertyValues.forEach(function(propertyValue){
    __addUpdatePropertyValue(propertyValue);
   });
}

/**
 * 
 * @param {*} propertyValue single property value that will be added/updated
 */
function __addUpdatePropertyValue(propertyValue){
    service.debug("addUpdatePropertyValue function called, passed message " + propertyValue + " argument");
    var propertyValueSet;
    try {
        propertyValueSet = MXServer.getMXServer().getMboSet("MAXPROPVALUE", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("propname = :1");
        sqlf.setObject(1, "MAXPROPVALUE", "PROPNAME", property.propname);
        propertyValueSet.setWhere(sqlf.format());

        if(propertyValueSet.isEmpty()){
            //property value does not exist, add
            service.debug("Property value for property" + propertyValue.propname + " does not exist. Adding the property value.");
            var propertyValue = propertyValueSet.add();
            propertyValue.setValue("PROPNAME", propertyValue.propname);
            propertyValue.setValue("SERVERNAME", propertyValue.servername);
            propertyValue.setValue("SERVERHOST", propertyValue.serverhost);
            propertyValue.setValue("PROPVALUE", propertyValue.propvalue);
            propertyValue.setValue("ENCRYPTEDVALUE", propertyValue.encryptedvalue);
        }
        else{
            //property value exists, update
            service.debug("Property value for property " + propertyValue.propname + " exists. Updating the property.");
            var propertyValue = propertyValueSet.moveFirst();
            propertyValue.setValue("PROPVALUE", propertyValue.propvalue);
            propertyValue.setValue("ENCRYPTEDVALUE", propertyValue.encryptedvalue);
        }
        propertyValueSet.save();
    }
    finally{
        __close(propertyValueSet);
    }
    service.debug("addUpdatePropertyValue function end");
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
                "propname":"propname",
                "description":"description",
                "domainid":"domainid",
                "encrypted":"encrypted",
                "fileoverride":"fileoverride",
                "globalonly":"globalonly",
                "instanceonly":"instanceonly",
                "liverefresh":"liverefresh",
                "masked":"masked",
                "maxtype":"maxtype",
                "nullsallowed":"nullsallowed",
                "onlinechanges":"onlinechanges",
                "securelevel":"securelevel"
            },
            {
                "propname":"propname",
                "description":"description",
                "domainid":"domainid",
                "encrypted":"encrypted",
                "fileoverride":"fileoverride",
                "globalonly":"globalonly",
                "instanceonly":"instanceonly",
                "liverefresh":"liverefresh",
                "masked":"masked",
                "maxtype":"maxtype",
                "nullsallowed":"nullsallowed",
                "onlinechanges":"onlinechanges",
                "securelevel":"securelevel"
            }
        ]
    */
    service.debug("Properties JSON: " + properties);
    properties.forEach(function(property){
        __removeProperty(property);
   });
}

/**
 * 
 * @param {*} property single property that will be deleted
 */
function __removeProperty(property){
    service.debug("removeProperty function called, passed message " + property + " argument");
    var propertySet;
    try {
        propertySet = MXServer.getMXServer().getMboSet("MAXPROP", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("propname = :1");
        sqlf.setObject(1, "MAXPROP", "PROPNAME", property.propname);
        propertySet.setWhere(sqlf.format());

        if(!propertySet.isEmpty()){
            //property exists, delete
            service.debug("Property " + property.propname + " exists. Deleting the property.");
            var property = propertySet.moveFirst();
            property.delete();
        }
        else{
            //property does not exist
            service.debug("Property " + property.propname + " does not exist. Taking no action.");
        }
        
        propertySet.save();
    }
    finally{
        __close(propertySet);
    }
    service.debug("removeProperty function end");
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
                "propname":"propname",
                "servername":"servername",
                "serverhost":"serverhost",
                "propvalue":"propvalue",
                "encryptedvalue":"encryptedvalue",
            },
            {
                "propname":"propname",
                "servername":"servername",
                "serverhost":"serverhost",
                "propvalue":"propvalue",
                "encryptedvalue":"encryptedvalue",
            }
        ]
    */
    service.debug("Property values JSON: " + propertyValues);
    propertyValues.forEach(function(propertyValue){
    __removePropertyValue(propertyValue);
   });
}

/**
 * 
 * @param {*} propertyValue single property value that will be deleted
 */
function __removePropertyValue(propertyValue){
    service.debug("removePropertyValue function called, passed message " + propertyValue + " argument");
    var propertyValueSet;
    try {
        propertyValueSet = MXServer.getMXServer().getMboSet("MAXPROPVALUE", MXServer.getMXServer().getSystemUserInfo());
        var sqlf = new SqlFormat("propname = :1");
        sqlf.setObject(1, "MAXPROPVALUE", "PROPNAME", property.propname);
        propertyValueSet.setWhere(sqlf.format());

        if(!propertyValueSet.isEmpty()){
            //property value exists, delete
            service.debug("Property value for property" + propertyValue.propname + " exists. Deleting the property value.");
            var propertyValue = propertyValueSet.moveFirst();
            propertyValue.delete();
        }
        else{
            //property value does not exist, do nothing
            service.debug("Property value for property " + propertyValue.propname + " does not exist. Taking no action.");
        }
        propertyValueSet.save();
    }
    finally{
        __close(propertyValueSet);
    }
    service.debug("removePropertyValue function end");
}


/**
 * Adds or updates a logger. This relies on the calling function calling save on the provided parent MboSet to save the changes.
 * 
 * @param {*} logger The logger to add.
 * @param {*} level The log level to set the logger at.
 * @param {*} parent The parent logger to add the child logger to.
 */
function __addLoggerIfDoesNotExist(logger, level, parent) {
    service.log_info("Adding or updating the logger " + logger + " and setting the level to " + level + ".");
    var loggerSet;
    try {
        loggerSet = MXServer.getMXServer().getMboSet("MAXLOGGER", MXServer.getMXServer().getSystemUserInfo());

        // Query for the log key
        var sqlFormat = new SqlFormat("logkey = :1");
        sqlFormat.setObject(1, "MAXLOGGER", "LOGKEY", parent.getString("LOGKEY") + "." + logger);

        loggerSet.setWhere(sqlFormat.format());
        var child;
        // if the logkey does not exist create it, otherwise get the existing logger and update its level.
        if (loggerSet.isEmpty()) {
            child = parent.getMboSet("CHILDLOGGERS").add();
            child.setValue("LOGGER", logger);
            child.setValue("LOGLEVEL", level);
            service.log_info("Added the logger " + logger + " and set the level to " + level + ".");
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