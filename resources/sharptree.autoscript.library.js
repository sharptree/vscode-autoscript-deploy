/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
// @ts-nocheck

MboConstants = Java.type('psdi.mbo.MboConstants');

DBShortcut = Java.type('psdi.mbo.DBShortcut');

SqlFormat = Java.type('psdi.mbo.SqlFormat');

MXServer = Java.type('psdi.server.MXServer');

MXSession = Java.type('psdi.util.MXSession');

MXException = Java.type('psdi.util.MXException');

RuntimeException = Java.type('java.lang.RuntimeException');

/**
 * 
 * @param {*} messages JSON representation of messages to be added/updated
 */
function addUpdateMessages(messages){
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
        addUpdateMessages(message);
   });
}

/**
 * 
 * @param {*} message single message that will be added/updated
 */
function addUpdateMessage(message){
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
function removeMessages(messages){
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
        removeMessage(message);
   });
}

/**
 * 
 * @param {*} message single message that will be deleted
 */
function removeMessage(message){
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
function addUpdateProperties(properties){
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
    addUpdateProperty(property);
   });
}

/**
 * 
 * @param {*} property single property that will be added/updated
 */
function addUpdateProperty(property){
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
function addUpdatePropertyValues(propertyValues){
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
    addUpdatePropertyValue(propertyValue);
   });
}

/**
 * 
 * @param {*} propertyValue single property value that will be added/updated
 */
function addUpdatePropertyValue(propertyValue){
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
function removeProperties(properties){
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
        removeProperty(property);
   });
}

/**
 * 
 * @param {*} property single property that will be deleted
 */
function removeProperty(property){
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
function removePropertyValues(propertyValues){
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
    removePropertyValue(propertyValue);
   });
}

/**
 * 
 * @param {*} propertyValue single property value that will be deleted
 */
function removePropertyValue(propertyValue){
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
 * Close and clean up a MboSet.
 * @param {psdi.mbo.MboSet} mboSet The MboSet to close and cleanup.
 */
function __close(mboSet) {
    if (mboSet && mboSet instanceof MboSet) {        
        mboSet.close();
        mboSet.cleanup();
    }
}