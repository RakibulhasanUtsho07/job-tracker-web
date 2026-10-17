export type JobRole = {
  id: string;
  title: string;
  department: string;
  location: string;
  workMode: "Remote" | "Hybrid" | "On-site";
  employmentType: "Full-time" | "Internship" | "Contract";
  level: string;
  salary: string;
  description: string;
  highlights: string[];
  teamColor: "mint" | "lavender" | "peach";
  postedLabel: string;
};

export const JOB_ROLES: JobRole[] = [
  {
    id: "web-developer",
    title: "Web Developer",
    department: "Engineering",
    location: "Dhaka, Bangladesh",
    workMode: "Hybrid",
    employmentType: "Full-time",
    level: "Junior · Mid-level",
    salary: "৳45k–৳85k / month",
    description: "Build thoughtful, fast experiences that make complicated work feel simple.",
    highlights: ["React & TypeScript", "Design systems", "Product collaboration"],
    teamColor: "mint",
    postedLabel: "Posted 2 days ago",
  },
  {
    id: "product-designer",
    title: "Product Designer",
    department: "Design",
    location: "Remote · Bangladesh",
    workMode: "Remote",
    employmentType: "Full-time",
    level: "Mid-level",
    salary: "৳55k–৳95k / month",
    description: "Turn customer insight into useful, accessible product experiences.",
    highlights: ["UX research", "Prototyping", "Accessibility"],
    teamColor: "lavender",
    postedLabel: "Posted 3 days ago",
  },
  {
    id: "backend-engineer",
    title: "Backend Engineer",
    department: "Engineering",
    location: "Dhaka, Bangladesh",
    workMode: "Hybrid",
    employmentType: "Full-time",
    level: "Mid-level",
    salary: "৳70k–৳120k / month",
    description: "Design dependable APIs and services for a product used every day.",
    highlights: ["Node.js", "API design", "Data integrity"],
    teamColor: "peach",
    postedLabel: "Posted 4 days ago",
  },
  {
    id: "qa-engineer",
    title: "QA Engineer",
    department: "Engineering",
    location: "Dhaka, Bangladesh",
    workMode: "On-site",
    employmentType: "Full-time",
    level: "Junior · Mid-level",
    salary: "৳40k–৳75k / month",
    description: "Make quality a shared habit through useful automated and exploratory tests.",
    highlights: ["Test strategy", "Automation", "Release confidence"],
    teamColor: "lavender",
    postedLabel: "Posted 1 week ago",
  },
  {
    id: "data-analyst-intern",
    title: "Data Analyst Intern",
    department: "Data",
    location: "Remote · Bangladesh",
    workMode: "Remote",
    employmentType: "Internship",
    level: "Entry-level",
    salary: "৳18k–৳25k / month",
    description: "Help teams ask sharper questions and make evidence-led decisions.",
    highlights: ["SQL fundamentals", "Data storytelling", "Mentorship"],
    teamColor: "mint",
    postedLabel: "Posted 1 week ago",
  },
  {
    id: "customer-success",
    title: "Customer Success Associate",
    department: "Customer Experience",
    location: "Dhaka, Bangladesh",
    workMode: "Hybrid",
    employmentType: "Full-time",
    level: "Entry-level",
    salary: "৳35k–৳60k / month",
    description: "Help people get real value from products and share feedback with the team.",
    highlights: ["Customer support", "Communication", "Problem solving"],
    teamColor: "peach",
    postedLabel: "Posted 9 days ago",
  },
];

export function getRoleById(roleId: string): JobRole | undefined {
  return JOB_ROLES.find((role) => role.id === roleId);
}
