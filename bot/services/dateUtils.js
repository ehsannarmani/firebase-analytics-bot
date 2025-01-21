function formatFirebaseDate(yyyymmdd) {
    const year = yyyymmdd.slice(0, 4);
    const month = yyyymmdd.slice(4, 6);
    const day = yyyymmdd.slice(6, 8);
    return `${year}-${month}-${day}`;
}

function getFormattedDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function formatLifetimeUsersByCountry(data, requestedCountries) {
    let result = data
    if (requestedCountries.length > 0) {
        result = result.filter(item => requestedCountries.some(country=> item.country.toLowerCase() === country.toLowerCase()))
    }
    result = result.map(item => `📍 <code>${item.country.replace("(not set)", "Unknown")}</code>: <code>${item.users}</code> users`)
        .join('\n');
    return result
}

function getMonthName(month) {
    const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    return monthNames[month - 1];
}

module.exports = {
    formatFirebaseDate,
    getFormattedDate,
    formatLifetimeUsersByCountry,
    getMonthName,
};
