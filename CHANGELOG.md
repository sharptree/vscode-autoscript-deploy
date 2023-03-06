# Release Notes
## 1.8.1
- Add support for extracting and deploying inspection domains and signatures.
  
## 1.8.0
- Add support for extracting and deploying inspection forms.
  
## 1.7.0
- Fixed bug in python scriptConfig parser that would find the scriptConfig even if it was commented out.
- Add support for specifying maxvar, properties and maxmessages values in the scriptConfig.
  
## 1.6.4
- Fixed typo in documentation.
- Removed debug console.log and System.out statements.

## 1.6.3
- Compatibility fixes for Maximo Manage 8.5.
- Fixed log header issue that caused log streaming to fail prematurely.

## 1.6.2 
- Updated dependencies to address security bulletins.
  
## 1.6.1
- Fixed error that could occur when applying the log level as part of the initial install.
  
## 1.6.0
- Added support for exporting screen definition conditional properties.
- Added support for Log4j 2, for Maximo environments that have been patched for Log4Shell.
  
## 1.5.1 
- Added support for systemlib presentation XML.
  
## 1.5.0
- Added support for screen extract and deploy.
- Added tag Id generation shortcut.
- Updated documentation and screen shots.
  
## 1.4.0 
- Added log streaming to local file.
- Bug fixes

## 1.3.0
- Added api/script context support.  
  
## 1.2.0
- Added support for API Key authentication.
  
## 1.1.1 
- Fixed missing check for action
  
## 1.1.0
- Add source comparison with the server.
- Fix action name missing from extract.
    
## 1.0.26
- Replace Filbert Python/Jython parsing library with regex to extract the config string.

## 1.0.25
- Allow for only sending the Maxauth header.
  
## 1.0.24
- Change to dark theme.
  
## 1.0.23
- Documentation edits.
- Updated icon.
- Updated banner theme.
- Move change log to CHANGELOG.md

## 1.0.22
- Add feature for defining an `onDeploy` function that will be called when the script is deployed.

## 1.0.21
- Fixed error when extracting scripts with spaces in the name.

## 1.0.20
- Documentation update.
  
## 1.0.19
- Documentation updates.
- Prettier configuration details for preserving property quotes.
  
## 1.0.18
- Replaced Authentication Type setting with automatic detection of the authentication type.
  
## 1.0.16 / 17
- Fixed formatting of the Automation Scripts table.
- Fixed untrusted SSL handling.
- Added custom CA setting and handling.

## 1.0.15 
- Documentation fixes.  

## 1.0.14
- Documentation updates and build pipeline testing.

## 1.0.13
- Documentation updates.
  
## 1.0.12
- MAS 8 with OIDC login support.
- Fixes for Form based login.
  
## 1.0.11
- Updated documentation with Python / Jython example.
  
## 1.0.10
- Fixed Windows path handling.

## 1.0.9
- Fixed paging size
- Fixed extract script naming issue.
  
## 1.0.8
- Moved the version dependency back to 1.46.

## 1.0.7
- Added extract script functionality.

## 1.0.6

- Fixed checks for attribute launch points.
- Added setting for network timeout.
- Fixed try / catch / finally Python parsing support.
  
## 1.0.4

- Added Python support.
- Added deployment tracking.
  
## 1.0.3

- Added context support.
- Added automatic upgrade path support.

## 1.0.2

- Removed check for Java version due to permission issues checking Maximo JVM information.

## 1.0.1

- Add checks for supported versions of Maximo and Java.
- Improve deployment progress feedback.
- Fixed compatibility issue with Maximo versions prior to 7.6.1.2.

## 1.0.0

- Initial release of the Sharptree VS Code Automation Script Deployment Utility.