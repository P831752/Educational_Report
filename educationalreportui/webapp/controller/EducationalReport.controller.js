sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "com/lt/educationalreportui/model/Formatter",
    "sap/m/MessageBox",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library"
], (Controller, JSONModel, MessageToast, Filter, FilterOperator, Formatter, MessageBox, Spreadsheet, exportLibrary) => {
    "use strict"

    let EdmType = exportLibrary.EdmType

    return Controller.extend("com.lt.educationalreportui.controller.EducationalReport", {
        formatter: Formatter,

        async onInit() {
            this.getView().setBusy(true)

            //Model Initialization
            let oModel = new JSONModel()
            this.getView().setModel(oModel, "reportModel")
            let deModel = new JSONModel()
            this.getView().setModel(deModel, "reportDetailModel")

            //To fetch the Current Logged in user
            let email = await this.getUserInfo()
            if (!email) {
                throw new Error("Unable to get Logged User Email ID. Please check with ICHR")
            }
            // Step 3: Get PSID using email
            this.currentUser = await this.getPSID(email)
            if (!this.currentUser) {
                throw new Error("PSID not found for the logged-in user.")
            }
            // this.currentUser = "244324" //Admin: 20069121 20080608 20312919 HR: 20367055 244324

            //Get Permission group of Current User
            let permissionGrp = await this.getPermissionGroup()

            if(permissionGrp.group){
            //To fetch all the ICs
            this.icData = await this.getICs(permissionGrp.userIC)
            //To fetch all the Records 
            this.fetchRecords()
            }
            
            else{
                this.getView().setBusy(false)
                MessageBox.warning("User do not have permission to view IC Records")
            }

        },

        //To SF-BTP SSO Logged User	
		async getUserInfo() {
			try {
				let response = await fetch("/services/userapi/currentUser")

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`)
				}

				let data = await response.json()
				console.log("BTP User Info:", data)

				// Show welcome message
				MessageToast.show(`Welcome ${data.firstname} ${data.lastname}`)
				console.log("Logged user:" + data.name)
				return data.email

			} catch (err) {
				console.log("Error fetching user info", err)
				MessageToast.show("Unable to fetch user info")
				return null // return null so caller can handle it
			}
		},

        getPSID(email) {
			return new Promise((resolve, reject) => {
				let oModel = this.getOwnerComponent().getModel()

				let aFilters = [
					new Filter("emailAddress", FilterOperator.EQ, email),
					new Filter("emailType", FilterOperator.EQ, "12824"),
				]

				oModel.read("/PerEmail", {
					filters: aFilters,
					success: (oData) => {
						if (oData.results.length > 0) {
							let psId = oData.results[0].personIdExternal
							resolve(psId)
						} else {
							reject(new Error("No PSID found for the given email."))
						}
					},
					error: (err) => {
						console.error("Failed to fetch PSID:", err)
						reject(new Error("Error fetching PSID."))
					}
				})
			})
		},

        getPermissionGroup() {
            let oModel = this.getOwnerComponent().getModel()
            return new Promise((resolve, reject) => {
                oModel.read("/getDynamicGroupsByUser", {
                    urlParameters: {
                        userId: `'${this.currentUser}'`,
                        groupSubType: "permission"
                    },
                    success: async (oData) => {
                        let permissionGrp = {}
                        // Check for Admin Group: "EDU_BTP_ADM_RPT_ALL"
                        let adminGroup = oData.results.some(group => group.groupName === "EDU_BTP_ADM_RPT_ALL")
                        if (adminGroup) {
                            permissionGrp.group = "EDU_BTP_ADM_RPT_ALL"
                        } else {
                            // Check for HR Group: "EDU_BTP_IC_HRADM_RPT"
                            let hrGroup = oData.results.some(group => group.groupName === "EDU_BTP_IC_HRADM_RPT")
                            if (hrGroup) {
                                permissionGrp.group = "EDU_BTP_IC_HRADM_RPT"
                                permissionGrp.userIC = await this.getUserIc()
                            }
                        }
                        resolve(permissionGrp)
                    },
                    error: (oError) => {
                        console.error("Error fetching permission groups:", oError)
                        reject(oError)
                    }
                })
            })
        },

        getUserIc() {
            let oModel = this.getOwnerComponent().getModel()
            return new Promise((resolve, reject) => {
                let aFilters = [
                    new Filter("userId", FilterOperator.EQ, this.currentUser)
                ]
                let url = "/EmpJob?$select=userId,payGrade,businessUnit,businessUnitNav/name"

                oModel.read(url, {
                    filters: aFilters,
                    success: (oData) => {
                        resolve(oData.results[0].businessUnit)
                    },
                    error: (oError) => {
                        resolve(oError)
                    }
                })
            })
        },

        getICs(userIC) {
            return new Promise((resolve, reject) => {
                let oModel = this.getOwnerComponent().getModel()

                // Define exclusion filters for externalCode
                const exclusionFilters = new Filter({
                    filters: [
                        new Filter("externalCode", FilterOperator.NE, "NOT"),
                        new Filter("externalCode", FilterOperator.NE, "LTSCTDM"),
                        new Filter("externalCode", FilterOperator.NE, "LTFS"),
                        new Filter("externalCode", FilterOperator.NE, "LTCG")
                    ],
                    and: true
                });

                let oFilter;

                if (userIC) {
                    oFilter = new Filter({
                        filters: [
                            new Filter("status", FilterOperator.EQ, "A"),
                            new Filter("externalCode", FilterOperator.EQ, userIC),
                            exclusionFilters
                        ],
                        and: true
                    });
                } else {
                    oFilter = new Filter({
                        filters: [
                            new Filter("status", FilterOperator.EQ, "A"),
                            exclusionFilters
                        ],
                        and: true
                    });
                }

                oModel.read("/FOBusinessUnit", {
                    filters: [oFilter],
                    success: (oData) => {

                        let countPromises = oData.results.map((item) => {
                            let icCode = item.externalCode
                            return this.getTotalCount(icCode)
                                .then((count) => {
                                    return {
                                        icCode: icCode, icText: item.description_defaultValue, totalCount: count
                                    }
                                })
                                .catch((error) => {
                                    console.error("Error for " + icCode + ":", error)
                                    return { icCode: icCode, count: null }
                                })
                        })

                        Promise.all(countPromises).then((countResults) => {
                            console.log("All counts:", countResults)
                            resolve(countResults)
                        })
                    },

                    error: (oError) => {
                        MessageBox.error("Error fetching IC Code Text:", oError)
                        reject(oError)
                    }
                })
            })
        },

        getTotalCount(icCode) {
            let oModel = this.getOwnerComponent().getModel()
            return new Promise((resolve, reject) => {
                oModel.read("/EmpJob/$count", {
                    urlParameters: {
                        "$filter": "businessUnit eq '" + icCode + "' and emplStatus eq '6021'"
                    },
                    success: function (oData, response) {
                        resolve(oData)
                    },
                    error: function (oError) {
                        reject(oError)
                    }
                })
            })
        },

        fetchRecords() {
            let oModel = this.getOwnerComponent().getModel("educational")
            let oBinding = oModel.bindList("/Educational_Details")
            let detailData = []

            oBinding.requestContexts().then((aContexts) => {
                let oData = aContexts.map((oContext) => oContext.getObject())

                let allStatuses = ["D", "PA", "A", "SA", "R"]

                // Original IC lookup: code -> description
                let icLookup = Object.fromEntries(this.icData.map(ic => [ic.icCode, ic.icText]))

                // Reverse lookup: description -> code
                let icReverseLookup = Object.fromEntries(
                    Object.entries(icLookup).map(([code, desc]) => [desc, code])
                )

                let icMap = {}

                // Step 1: Initialize icMap with all ICs from icLookup
                Object.entries(icLookup).forEach(([icCode, icText]) => {
                    icMap[icCode] = {
                        IC: icCode,
                        ICText: icText,
                        summation: 0,
                        Records: [],
                        D: 0, PA: 0, A: 0, SA: 0, R: 0,
                        psidSet: new Set()
                    }
                })

                // Step 2: Process oData and update icMap
                oData.forEach((item) => {
                    let icText = item.ic
                    let status = item.status
                    let psid = item.psid

                    if (!icText || !psid) return

                    let icCode = icReverseLookup[icText]
                    if (!icCode || !icMap[icCode]) return

                    if (!icMap[icCode].psidSet.has(psid)) {
                        icMap[icCode].psidSet.add(psid)
                        icMap[icCode].Records.push(item)
                        detailData.push(item)

                        if (status && allStatuses.includes(status)) {
                            icMap[icCode][status] += 1
                        }

                        icMap[icCode].summation += 1
                    }
                })

                // Step 3: Finalize data
                let finalData = Object.values(icMap).map(entry => {
                    let icInfo = this.icData.find(ic => ic.icCode === entry.IC)
                    entry.Total = icInfo ? icInfo.totalCount : 0
                    entry.NAY = entry.Total - entry.summation

                    delete entry.psidSet
                    return entry
                })

                this.getView().getModel("reportModel").setData(finalData)
                this.getView().getModel("reportModel").updateBindings()

                this.getView().getModel("reportDetailModel").setData(detailData)
                this.getView().getModel("reportDetailModel").updateBindings()

                this.getView().setBusy(false)
            })
                .catch((oError) => {
                    console.error("Error fetching records:", oError)
                })
        },

        onLinkPress(oEvent) {
            let sPath = oEvent.getSource().getBindingContext("reportModel").getPath()
            let statusPath = oEvent.getSource().getBindingInfo("text").binding.getPath()
            let records = this.getView().getModel("reportModel").getProperty(sPath).Records
            let filteredData

            filteredData = records.filter(item => item.status === statusPath)
            // if (statusPath !== "Total") {
            //     filteredData = records.filter(item => item.status === statusPath)
            // } else {
            //     filteredData = records
            // }

            this.getView().getModel("reportDetailModel").setData(filteredData)
        },

        onReportExport() {
            let aCols = this._reportColumnConfig()
            let oTable = this.byId("idTable")

            // Get filtered items from the table
            let aItems = oTable.getItems()
            let aFilteredData = aItems.map(function (oItem) {
                let oContext = oItem.getBindingContext("reportModel")
                let oData = oContext.getObject()

                return {
                    IC: oData.IC,
                    ICText: oData.ICText,
                    D: oData.D,
                    PA: oData.PA,
                    A: oData.A,
                    SA: oData.SA,
                    R: oData.R,
                    NAY: oData.NAY,
                    Total: oData.Total
                }
            }.bind(this))

            let oSettings = {
                workbook: { columns: aCols },
                dataSource: aFilteredData,
                fileName: "Education Validation Admin Report.xlsx"
            }

            let oSpreadsheet = new Spreadsheet(oSettings)
            oSpreadsheet.build()
                .then(function () {
                    MessageToast.show("Filtered export completed")
                })
                .catch(function (err) {
                    console.error("Export error:", err)
                })
        },

        _reportColumnConfig() {
            return [
                { label: "IC", property: "IC", type: EdmType.String },
                { label: "IC Text", property: "ICText", type: EdmType.String },
                { label: "Save As Draft", property: "D", type: EdmType.Int32 },
                { label: "Pending Approval", property: "PA", type: EdmType.Int32 },
                { label: "Approved", property: "A", type: EdmType.Int32 },
                { label: "Self Approved", property: "A", type: EdmType.Int32 },
                { label: "Rejected", property: "R", type: EdmType.Int32 },
                { label: "No Action Yet", property: "NAY", type: EdmType.Int32 },
                { label: "Total", property: "Total", type: EdmType.Int32 }
            ]
        },

        onDetailExport: function () {
            let aCols = this._detailColumnConfig()

            // Get all data directly from the model
            let aAllData = this.getView().getModel("reportDetailModel").getData()

            // Map and format the data
            let aFilteredData = aAllData.map(function (oData) {
                return {
                    psid: oData.psid,
                    name: oData.name,
                    ic: oData.ic,
                    ichr: oData.ichr,
                    status: this.formatter.statusText(oData.status),
                    modifiedAt: oData.modifiedAt
                }
            }.bind(this))


            // Check for empty records
            if (!aFilteredData || aFilteredData.length === 0) {
                MessageToast.show("No data available to export.");
                return;
            }

            // Spreadsheet settings
            let oSettings = {
                workbook: { columns: aCols },
                dataSource: aFilteredData,
                fileName: "Education Validation Admin Details Report.xlsx"
            }

            // Build and export
            new Spreadsheet(oSettings).build()
                .then(() => MessageToast.show("Export completed"))
                .catch(err => console.error("Export error:", err))
        },

        _detailColumnConfig() {
            return [
                { label: "PSID", property: "psid", type: EdmType.String },
                { label: "Name", property: "name", type: EdmType.String },
                { label: "IC", property: "ic", type: EdmType.String },
                { label: "ICHR", property: "ichr", type: EdmType.String },
                { label: "Status", property: "status", type: EdmType.String },
                { label: "Modified On", property: "modifiedAt", type: EdmType.DateTime }
            ]
        }

    })
})