const DeletedUser = require('../models/DeletedUser');
const DeletedUserMessage = require('../models/DeletedUserMessage');

/* ============================================================
   HELPERS
   ============================================================ */

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getPaging = (query, defaultLimit = 20, maxLimit = 100) => {
  const pageNum = Math.max(parseInt(query.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
};

const buildPagination = (total, pageNum, limitNum) => ({
  total,
  page: pageNum,
  limit: limitNum,
  totalPages: Math.max(Math.ceil(total / limitNum), 1)
});

/* ============================================================
   DELETED USERS (არქივი)
   ============================================================ */

// GET /api/admin/deleted-users?deletedBy=self|admin&search=&page=1&limit=20
// სიაში მძიმე ველები (data, related) არ ბრუნდება — მხოლოდ stats
exports.getDeletedUsers = async (req, res) => {
  try {
    const { deletedBy, search } = req.query;
    const { pageNum, limitNum, skip } = getPaging(req.query);

    const query = {};
    if (deletedBy && ['self', 'admin'].includes(deletedBy)) {
      query.deletedBy = deletedBy;
    }
    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
        { personalNumber: regex }
      ];
    }

    const [items, total] = await Promise.all([
      DeletedUser.find(query)
        .select('-data -related')
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      DeletedUser.countDocuments(query)
    ]);

    res.json({ success: true, items, pagination: buildPagination(total, pageNum, limitNum) });
  } catch (error) {
    console.error('ADMIN GET DELETED USERS ERROR:', error);
    res.status(500).json({ success: false, message: 'წაშლილი მომხმარებლების ჩატვირთვა ვერ მოხერხდა' });
  }
};

// GET /api/admin/deleted-users/:id — სრული არქივი (snapshot + related)
exports.getDeletedUserById = async (req, res) => {
  try {
    const item = await DeletedUser.findById(req.params.id).lean();
    if (!item) {
      return res.status(404).json({ success: false, message: 'არქივი ვერ მოიძებნა' });
    }
    res.json({ success: true, item });
  } catch (error) {
    console.error('ADMIN GET DELETED USER BY ID ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'არქივი ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'არქივის ჩატვირთვა ვერ მოხერხდა' });
  }
};

// GET /api/admin/deleted-users/:id/messages?page=1&limit=50 — ჩატის ისტორია
exports.getDeletedUserMessages = async (req, res) => {
  try {
    const { pageNum, limitNum, skip } = getPaging(req.query, 50, 200);
    const query = { deletedUserId: req.params.id };

    const [rows, total] = await Promise.all([
      DeletedUserMessage.find(query).sort({ _id: 1 }).skip(skip).limit(limitNum).lean(),
      DeletedUserMessage.countDocuments(query)
    ]);

    res.json({
      success: true,
      messages: rows.map((r) => r.data),
      pagination: buildPagination(total, pageNum, limitNum)
    });
  } catch (error) {
    console.error('ADMIN GET DELETED USER MESSAGES ERROR:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'არქივი ვერ მოიძებნა' });
    }
    res.status(500).json({ success: false, message: 'შეტყობინებების ჩატვირთვა ვერ მოხერხდა' });
  }
};