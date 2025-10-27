
sap.ui.define([], function () {
    "use strict"
    return {

        statusText (status) {
            switch (status) {
                case "PA":
                    return "Pending Approval"
                case "A":
                    return "Approved"
                case "D":
                    return "In Draft"
                case "SA":
                    return "Self Approved"
                case "R":
                    return "Rejected"
                default:
                    return ""
            }
        },

        statusState (status) {
            switch (status) {
                case "PA": 
                    return "Warning"     
                case "A": 
                    return "Success"      
                case "D": 
                    return "Information"  
                case "SA": 
                    return "Success"      
                case "R": 
                    return "Error"       
                default: 
                    return "None"        
            }
        }

    }
})