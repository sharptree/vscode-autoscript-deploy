// HashMap = Java.type("java.util.HashMap");

load("nashorn:parser.js");

main();

function main(){
    try{

    }catch(error){
        var response = {};
        response.status = 'error';
        if (error instanceof ScriptError) {
            response.message = error.message;
            response.reason = error.reason;
        } else if (error instanceof Error) {
            response.message = error.message;        
        } else {
            response.cause = error;
        }

        responseBody = JSON.stringify(response);
            return;        
    }
}

var sat = parse(scriptInfo.getScriptSource());

result = "wrong type";
if (sat.type === "Program" && sat.body) {
    result = "not found";
    sat.body.forEach(function (element) {
        if (element.type === "VariableDeclaration") {
            if (element.declarations) {
                element.declarations.forEach(function (declaration) {
                    if (declaration.id && declaration.id.type === "Identifier" && declaration.id.name === "config") {
                        service.log_info(declaration.init.value);
                    }

                });
            }

            service.log_info(element.declarations['id']);

            //     if (element.declarations['id'].type === "Identifier" && element.declarations['config'].type === "config") {
            //         result = element.declarations['init'].value;
            //     }
        }
    });
}


function getConfigFromScript(script){
    if(script){
        var sat = parse(script);
        if (sat.type === "Program" && sat.body) {
            result = "not found";
            sat.body.forEach(function (element) {
                if (element.type === "VariableDeclaration") {
                    if (element.declarations) {
                        element.declarations.forEach(function (declaration) {
                            if (declaration.id && declaration.id.type === "Identifier" && declaration.id.name === "config") {
                                return declaration.init.value;
                            }
        
                        });
                    }
                }
            }); 
            throw Error("Configuration was not found in the script");       
        }else{
            throw Error("wrong type");
        }
    }else{
        throw Error("The script source is required");
    }
}


function ScriptError(reason, message) {
    Error.call(this, message)
    this.reason = reason;
    this.message = message;
}

// ConfigurationError derives from Error
ScriptError.prototype = Object.create(Error.prototype);
ScriptError.prototype.constructor = ScriptError;
ScriptError.prototype.element

// responseBody = result;