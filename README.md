# VS Code Automation Script Deployment Utility

Integrates deploying [Maximo Automation Scripts](https://www.ibm.com/docs/SSLLAM_7.6.0/com.ibm.mbs.doc/autoscript/c_automation_scripts.html) into VS Code. 

The extension allows developers to describe the automation script through the use of a `scriptConfig` variable and then deploy the script directly to Maximo from VSCode.  The provided `SHARPTREE.AUTOSCRIPT.DEPLOY` Automation Script provides support for build pipelines and automated deploying of Automation Scripts from a Git repository.

## scriptConfig Variable
Each script must define a variable named `scriptConfig` that is a JSON object describing how to deploy the script.  At a minimum the `autoscript` attribute is required, all other attributes are optional.  All configuration attributes are available and are defined by their label name without spaces, in camel case.  The example below provides the basic structure.

```javascript
main();

function main(){
    // entry point for the script.
}

var scriptConfig = {
    "autoscript":"EXAMPLE_SCRIPT",
    "description":"An example script for deployment",
    "version":"1.0.4",
    "active":true,
    "logLevel":"INFO",
    "autoScriptVars":[
        {
            "varname":"examplevar",
            "description":"An example variable"
        }
    ],
    "scriptLaunchPoints":[
        {
            "launchPointName":"EXAMPLELP",
            "launchPointType":"OBJECT",
            "description":"An example launch point for Labor",
            "objectName":"LABOR",
            "save":true,
            "add":true,
            "update":true,
            "beforeSave":true,
            "launchPointVars":[
                {
                "varName":"examplevar",
                "varBindingValue":"Example binding"
                }
            ]
        }
    ],
}

```

## Requirements

- Maximo 7.6.0.8 or higher.
- Only JavaScript is supported, Jython and Python scripts are not supported.
- Files must have a `.js` extension.
- Java 8 (Nashorn) is required.
- Initial configuration must be done by a user in the administrative group defined by `ADMINGROUP` `MAXVARS` entry.  Typically this is `MAXADMIN`.

## Release Notes
### 1.0.4

- Added Python support.
- Added deployment tracking.
- 
### 1.0.3

- Added context support.
- Added automatic upgrade path support.

### 1.0.2

- Removed check for Java version due to permission issues checking Maximo JVM information.

### 1.0.1

- Add checks for supported versions of Maximo and Java.
- Improve deployment progress feedback.
- Fixed compatibility issue with Maximo versions prior to 7.6.1.2.

### 1.0.0

Initial release of the Sharptree VS Code Automation Script Deployment Utility.