/*global QUnit*/

sap.ui.define([
	"com/lt/educationalreportui/controller/EducationalReport.controller"
], function (Controller) {
	"use strict";

	QUnit.module("EducationalReport Controller");

	QUnit.test("I should test the EducationalReport controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
