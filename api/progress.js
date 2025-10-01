let progress = { current: 0, total: 0, currentInn: '', percentage: 0 };

export default function handler(req, res) {
  res.status(200).json(progress);
}

export function updateProgress(newProgress) {
  progress = newProgress;
}