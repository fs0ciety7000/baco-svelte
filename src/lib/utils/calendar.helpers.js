// Utilitaires de date purs pour alléger les composants Svelte

export const formatDateKey = (date) => 
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const isDateInRange = (checkDate, startStr, endStr) => {
    const check = new Date(checkDate).setHours(12,0,0,0);
    const start = new Date(startStr).setHours(0,0,0,0);
    const end = new Date(endStr).setHours(23,59,59,999);
    return check >= start && check <= end;
};

export function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function generateCalendarDays(year, month, leaveRequests = []) {
    const calendarDays = [];
    const firstDayOfMonth = new Date(year, month, 1);
    const today = new Date();
    
    // ISO Weekday: 1 (Mon) - 7 (Sun)
    const getISOWeekday = (d) => (d.getDay() === 0 ? 7 : d.getDay());
    let startDayOfWeek = getISOWeekday(firstDayOfMonth);
    
    let day = new Date(firstDayOfMonth);
    day.setDate(day.getDate() - (startDayOfWeek - 1));

    let loops = 0;
    while (loops < 42) { // 6 semaines de 7 jours
        const dateKey = formatDateKey(day);
        const currentDayObj = new Date(day);
        
        const dayLeaves = leaveRequests.filter(req => {
            if (req.status === 'REJECTED') return false; 
            return isDateInRange(currentDayObj, req.start_date, req.end_date);
        });

        calendarDays.push({
            date: currentDayObj,
            dateKey: dateKey,
            dayOfMonth: day.getDate(),
            isCurrentMonth: day.getMonth() === month,
            isToday: day.toDateString() === today.toDateString(),
            leaves: dayLeaves,
            weekNumber: getWeekNumber(currentDayObj),
            isMonday: currentDayObj.getDay() === 1
        });
        
        day.setDate(day.getDate() + 1);
        loops++;
    }
    return calendarDays;
}