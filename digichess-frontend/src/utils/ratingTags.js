export const getBlitzTag = (rating) => {
    if (rating == null || Number.isNaN(Number(rating))) return null;
    const value = Number(rating);
    if (value < 1900) return null;
    if (value < 2100) return 'DCM';
    if (value < 2300) return 'DM';
    if (value < 2400) return 'DIM';
    return 'DGM';
};

export const ratingTagClasses = {
    DCM: 'bg-purple-500/15 text-purple-500 dark:text-purple-300 border border-purple-400/40',
    DM: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-400/50',
    DIM: 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-400/50',
    DGM: 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-400/50',
};

export const getRatingTagClasses = (tag) => ratingTagClasses[tag] || ratingTagClasses.DCM;
