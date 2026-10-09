export function getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseDateString(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(day, month - 1, year);
}

export function shortDate(dateStr) {
    const [, month, day] = dateStr.split('-');
    return `${day}.${month}`;
}
