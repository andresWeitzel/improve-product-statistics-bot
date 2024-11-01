const { updateDateTime } = require("./dateTime");

function logStatus(id, action, productName, error) {
  console.log(
    `ID: ${id} | STATUS: ${action.toUpperCase()} | ` +
      `PRODUCTO: ${productName} | DATETIME: ${updateDateTime()}`
  );
  if (error) {
    console.error(`Error: ${error.message}`);
  }
}

module.exports = { logStatus };
