// // script.js
// const socket = io();
// const statusContainer = document.getElementById("statusContainer");
// let productCount = 0;

// socket.on("update", ({ id, status, product, url, datetime }) => {
//     const row = document.createElement("tr");
//     row.innerHTML = `
//         <td>${id}</td>
//         <td><div class="lamp ${status === "ok" ? "ok" : "fail"}"></div></td>
//         <td><a href="${url}" target="_blank">${product}</a></td>
//         <td>${datetime}</td>
//     `;
//     statusContainer.appendChild(row);
//     productCount++;

//     if (productCount >= 15) {
//         productCount = 0;
//         statusContainer.innerHTML = ""; // Limpia la tabla sin recargar la página
//     }
// });
