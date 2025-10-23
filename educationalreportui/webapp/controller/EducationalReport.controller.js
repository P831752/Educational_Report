sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) => {
    "use strict";

    return Controller.extend("com.lt.educationalreportui.controller.EducationalReport", {
        onInit() {
            this.getICs()
        },

        getICs() {
			return new Promise((resolve, reject) => {
				let oModel = this.getOwnerComponent().getModel()
				//let filters = [new Filter("externalCode", FilterOperator.EQ, icCode)]

				oModel.read("/FOBusinessUnit", {
					//filters: filters,
					success: async (oData) => {
						resolve(oData)
					},
					error: (error) => {
						console.error("Error fetching IC Code Text:", error)
						reject(error)
					}
				})
			})
		},
    });
});